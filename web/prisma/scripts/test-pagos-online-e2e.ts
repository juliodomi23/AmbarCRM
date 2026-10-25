import assert from "node:assert/strict";
import pg from "pg";
import { NextRequest } from "next/server";
import { db, dbRaw, runWithOrg } from "../../src/lib/db";
import { firmaHmac } from "../../src/lib/pagos/firmas";
import { cifrarCredencialPago } from "../../src/lib/pagos/credenciales";
import { POST as webhookPOST } from "../../src/app/api/public/pagos/webhook/[proveedor]/[org]/route";
import {
  conciliarPendientes,
  crearCheckoutVenta,
  procesarEventoPago,
  reembolsarPago,
} from "../../src/lib/pagos/servicio";

const appUrl = process.env.DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
for (const valor of [appUrl, adminUrl]) {
  if (!valor)
    throw new Error(
      "Define DATABASE_URL y ADMIN_DATABASE_URL para PostgreSQL aislado",
    );
  const url = new URL(valor);
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.pathname !== "/pagos_test"
  ) {
    throw new Error("La prueba solo admite localhost/pagos_test");
  }
}
process.env.PAGOS_PROVEEDOR = "mock";
process.env.PAGOS_MOCK_SECRET = "secreto-e2e-pagos";
process.env.PAGOS_BASE_URL = "http://localhost:3000";
process.env.PAGOS_ORG_PILOTO = "91";
process.env.PAGOS_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
const orgA = 91n;
const orgB = 92n;

function evento(pagoId: bigint, id: string, monto = "100.00", moneda = "MXN") {
  return {
    eventoId: id,
    tipo: "payment.updated",
    pagoId: String(pagoId),
    referencia: `payment-${pagoId}`,
    estado: "aprobado" as const,
    monto,
    moneda,
    payload: { status: "approved" },
  };
}

async function main() {
  const existentes = await admin.query(
    "SELECT id FROM orgs WHERE id IN (91,92)",
  );
  if (existentes.rowCount)
    throw new Error("La base pagos_test debe estar vacía");
  await admin.query(
    "INSERT INTO orgs (id,nombre,slug) VALUES (91,'Pagos A','pagos-a'),(92,'Pagos B','pagos-b')",
  );
  const pago = await runWithOrg(orgA, async () => {
    await db.moduloOrg.create({
      data: {
        clave: "pagos_en_linea",
        activo: true,
        config: { proveedor: "mock" },
      },
    });
    await db.credencialPago.create({
      data: {
        proveedor: "mock",
        accessTokenEncrypted: cifrarCredencialPago("token-mock-e2e"),
        webhookSecretEncrypted: cifrarCredencialPago(process.env.PAGOS_MOCK_SECRET!),
        sandbox: true,
      },
    });
    const venta = await db.venta.create({
      data: {
        folio: "V-PAGO-1",
        total: "100.00",
        subtotal: "100.00",
        moneda: "MXN",
        estado: "pendiente",
      },
    });
    return crearCheckoutVenta(
      { orgId: orgA, userId: null, rol: "admin", puesto: "Administrador" },
      {
        origenTipo: "venta",
        origenId: String(venta.id),
        idempotencyKey: "venta:e2e:primera",
      },
    );
  });

  const rechazado = await runWithOrg(orgA, () =>
    procesarEventoPago(
      orgA,
      "mock",
      evento(pago.id, "monto-invalido", "99.99"),
    ),
  );
  assert.equal(
    "rechazado" in rechazado && rechazado.rechazado,
    true,
    "monto distinto se rechaza y registra",
  );
  const monedaRechazada = await runWithOrg(orgA, () =>
    procesarEventoPago(orgA, "mock", evento(pago.id, "moneda-invalida", "100.00", "USD")),
  );
  assert.equal(
    "rechazado" in monedaRechazada && monedaRechazada.rechazado,
    true,
    "moneda distinta se rechaza y registra",
  );
  const aprobado = await runWithOrg(orgA, () =>
    procesarEventoPago(orgA, "mock", evento(pago.id, "aprobado-1")),
  );
  assert.equal(aprobado.duplicado, false);
  const duplicado = await runWithOrg(orgA, () =>
    procesarEventoPago(orgA, "mock", evento(pago.id, "aprobado-1")),
  );
  assert.equal(duplicado.duplicado, true);
  const concurrente = await runWithOrg(orgA, () =>
    Promise.allSettled([
      procesarEventoPago(orgA, "mock", evento(pago.id, "concurrente-1")),
      procesarEventoPago(orgA, "mock", evento(pago.id, "concurrente-2")),
    ]),
  );
  assert.equal(
    concurrente.filter((r) => r.status === "fulfilled").length,
    2,
      "dos eventos distintos para el mismo pago se serializan sin doble acreditación",
  );

  await runWithOrg(orgA, async () => {
    assert.equal(
      await db.pagoVenta.count({ where: { ventaId: pago.origenId } }),
      1,
      "el origen se acredita una sola vez",
    );
    assert.equal(
      (await db.venta.findUniqueOrThrow({ where: { id: pago.origenId } }))
        .estado,
      "pagada",
    );
    const reembolso = await reembolsarPago(
      { orgId: orgA, userId: null, rol: "admin", puesto: "Administrador" },
      pago.id,
      "40.00",
      "refund:e2e:parcial-1",
    );
    assert.equal(reembolso.estado, "aprobado");
    assert.equal(
      (await db.pagoOnline.findUniqueOrThrow({ where: { id: pago.id } }))
        .estado,
      "aprobado",
      "el primer parcial conserva el pago aprobado",
    );
    const duplicadoReembolso = await reembolsarPago(
      { orgId: orgA, userId: null, rol: "admin", puesto: "Administrador" },
      pago.id,
      "40.00",
      "refund:e2e:parcial-1",
    );
    assert.equal(duplicadoReembolso.id, reembolso.id, "reembolso repetido es idempotente");
    await reembolsarPago(
      { orgId: orgA, userId: null, rol: "admin", puesto: "Administrador" },
      pago.id,
      "60.00",
      "refund:e2e:parcial-2",
    );
    const pagoReembolsado = await db.pagoOnline.findUniqueOrThrow({ where: { id: pago.id } });
    assert.equal(pagoReembolsado.estado, "reembolsado");
    assert.equal(pagoReembolsado.montoReembolsado.toFixed(2), "100.00");
    await assert.rejects(
      reembolsarPago(
        { orgId: orgA, userId: null, rol: "admin", puesto: "Administrador" },
        pago.id,
        "1.00",
        "refund:e2e:excedente",
      ),
      /supera el monto disponible/,
    );
  });

  await runWithOrg(orgA, async () => {
    const ventaConcurrente = await db.venta.create({
      data: { folio: "V-CONCURRENTE", total: "50.00", subtotal: "50.00", moneda: "MXN", estado: "pendiente" },
    });
    const sesion = { orgId: orgA, userId: null, rol: "admin", puesto: "Administrador" };
    const resultados = await Promise.all([
      crearCheckoutVenta(sesion, { origenTipo: "venta", origenId: String(ventaConcurrente.id), idempotencyKey: "venta:e2e:concurrente-a" }),
      crearCheckoutVenta(sesion, { origenTipo: "venta", origenId: String(ventaConcurrente.id), idempotencyKey: "venta:e2e:concurrente-b" }),
    ]);
    assert.equal(resultados[0].id, resultados[1].id);
    assert.equal(await db.pagoOnline.count({ where: { origenId: ventaConcurrente.id, estado: "pendiente" } }), 1);

    const ventaOtra = await db.venta.create({
      data: { folio: "V-OTRA", total: "50.00", subtotal: "50.00", moneda: "MXN", estado: "pendiente" },
    });
    await assert.rejects(
      crearCheckoutVenta(sesion, { origenTipo: "venta", origenId: String(ventaOtra.id), idempotencyKey: resultados[0].idempotencyKey }),
      /pertenece a otro cobro/,
    );

    const ventaReintento = await db.venta.create({
      data: { folio: "V-REINTENTO", total: "75.00", subtotal: "75.00", moneda: "MXN", estado: "pendiente" },
    });
    const primero = await crearCheckoutVenta(sesion, { origenTipo: "venta", origenId: String(ventaReintento.id), idempotencyKey: "venta:e2e:reintento-uno" });
    await procesarEventoPago(orgA, "mock", evento(primero.id, "rechazar-reintento", "74.00"));
    const segundo = await crearCheckoutVenta(sesion, { origenTipo: "venta", origenId: String(ventaReintento.id), idempotencyKey: "venta:e2e:reintento-dos" });
    assert.notEqual(segundo.id, primero.id, "una clave nueva permite reintentar tras rechazo");

    const ventaCancelada = await db.venta.create({
      data: { folio: "V-TARDIA", total: "80.00", subtotal: "80.00", moneda: "MXN", estado: "pendiente" },
    });
    const tardio = await crearCheckoutVenta(sesion, { origenTipo: "venta", origenId: String(ventaCancelada.id), idempotencyKey: "venta:e2e:pago-tardio" });
    await db.venta.update({ where: { id: ventaCancelada.id }, data: { estado: "cancelada" } });
    await procesarEventoPago(orgA, "mock", evento(tardio.id, "aprobado-tardio", "80.00"));
    assert.equal((await db.venta.findUniqueOrThrow({ where: { id: ventaCancelada.id } })).estado, "cancelada");
    assert.equal(await db.tarea.count({ where: { titulo: { startsWith: `[Pago ${tardio.id}]` } } }), 1);

    const ventaEntregada = await db.venta.create({
      data: { folio: "V-ENTREGADA", total: "55.00", subtotal: "55.00", moneda: "MXN", estado: "pendiente" },
    });
    const segundoPago = await crearCheckoutVenta(sesion, {
      origenTipo: "venta", origenId: String(ventaEntregada.id), idempotencyKey: "venta:e2e:entregada-segundo",
    });
    await db.venta.update({ where: { id: ventaEntregada.id }, data: { estado: "entregada" } });
    await procesarEventoPago(orgA, "mock", evento(segundoPago.id, "aprobado-entregada", "55.00"));
    assert.equal(
      (await db.venta.findUniqueOrThrow({ where: { id: ventaEntregada.id } })).estado,
      "entregada",
      "un segundo pago no regresa una venta entregada a pagada",
    );

    const ventaCambiada = await db.venta.create({
      data: { folio: "V-TOTAL-CAMBIADO", total: "60.00", subtotal: "60.00", moneda: "MXN", estado: "pendiente" },
    });
    const pagoTotalOriginal = await crearCheckoutVenta(sesion, {
      origenTipo: "venta", origenId: String(ventaCambiada.id), idempotencyKey: "venta:e2e:total-original",
    });
    await db.venta.update({ where: { id: ventaCambiada.id }, data: { total: "65.00", subtotal: "65.00" } });
    await procesarEventoPago(orgA, "mock", evento(pagoTotalOriginal.id, "aprobado-total-cambiado", "60.00"));
    assert.equal(
      (await db.venta.findUniqueOrThrow({ where: { id: ventaCambiada.id } })).estado,
      "pendiente",
      "un pago con total anterior no acredita la venta modificada",
    );
    assert.equal(await db.tarea.count({ where: { titulo: { startsWith: `[Pago ${pagoTotalOriginal.id}]` } } }), 1);

    const ventaHttp = await db.venta.create({
      data: { folio: "V-WEBHOOK", total: "35.00", subtotal: "35.00", moneda: "MXN", estado: "pendiente" },
    });
    const pagoHttp = await crearCheckoutVenta(sesion, { origenTipo: "venta", origenId: String(ventaHttp.id), idempotencyKey: "venta:e2e:webhook-http" });
    const cuerpo = JSON.stringify(evento(pagoHttp.id, "webhook-http-1", "35.00"));
    const timestamp = String(Date.now());
    const firma = firmaHmac(process.env.PAGOS_MOCK_SECRET!, `${timestamp}.${cuerpo}`);
    const peticion = (signature = firma) => new NextRequest("http://localhost/api/public/pagos/webhook/mock/91", {
      method: "POST",
      headers: { "x-mock-timestamp": timestamp, "x-mock-signature": signature },
      body: cuerpo,
    });
    const valida = await webhookPOST(peticion(), { params: Promise.resolve({ proveedor: "mock", org: "91" }) });
    assert.equal(valida.status, 200, "la ruta HTTP acepta una firma válida");
    const duplicadaHttp = await webhookPOST(peticion(), { params: Promise.resolve({ proveedor: "mock", org: "91" }) });
    assert.equal((await duplicadaHttp.json()).duplicado, true, "la ruta HTTP reconoce el evento duplicado");
    assert.equal((await webhookPOST(peticion("mala"), { params: Promise.resolve({ proveedor: "mock", org: "91" }) })).status, 401);
    assert.equal((await webhookPOST(peticion(), { params: Promise.resolve({ proveedor: "mercado_pago", org: "91" }) })).status, 404);
  });

  await runWithOrg(orgB, async () => {
    await db.moduloOrg.create({ data: { clave: "pagos_en_linea", activo: true, config: {} } });
  });
  const orgIncorrecta = await webhookPOST(
    new NextRequest("http://localhost/api/public/pagos/webhook/mock/92", { method: "POST", body: "{}" }),
    { params: Promise.resolve({ proveedor: "mock", org: "92" }) },
  );
  assert.equal(orgIncorrecta.status, 409, "la ruta no reutiliza credenciales de otra organización");
  const conciliacion = await conciliarPendientes();
  assert.ok(conciliacion.procesados >= 0, "el cron continúa ante una organización sin credenciales");
  await runWithOrg(orgB, async () => {
    assert.equal(
      await db.pagoOnline.count(),
      0,
      "RLS oculta pagos de otra empresa",
    );
    assert.equal(
      await db.eventoPago.count(),
      0,
      "RLS oculta eventos de otra empresa",
    );
    assert.equal(await db.reembolsoPago.count(), 0, "RLS oculta reembolsos de otra empresa");
    assert.equal(await db.credencialPago.count(), 0, "RLS oculta credenciales de otra empresa");
    await assert.rejects(
      db.eventoPago.create({
        data: {
          pagoId: pago.id,
          proveedor: "mock",
          eventoId: "cruce-tenant",
          tipo: "payment.updated",
          payload: {},
        },
      }),
      /Foreign key constraint/,
      "la FK compuesta impide asociar un evento de otra empresa",
    );
  });
  const credencialPersistida = await admin.query(
    "SELECT access_token_encrypted, webhook_secret_encrypted FROM credenciales_pago WHERE org_id = 91",
  );
  assert.notEqual(credencialPersistida.rows[0].access_token_encrypted, "token-mock-e2e");
  assert.notEqual(credencialPersistida.rows[0].webhook_secret_encrypted, process.env.PAGOS_MOCK_SECRET);
  console.log(
    "pagos-online E2E: credenciales, concurrencia, estado de venta, reembolsos acumulativos, cron y RLS OK",
  );
}

try {
  await main();
} finally {
  await admin.end();
  await dbRaw.$disconnect();
}
