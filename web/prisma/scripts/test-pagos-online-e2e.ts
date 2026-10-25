import assert from "node:assert/strict";
import pg from "pg";
import { NextRequest } from "next/server";
import { db, dbRaw, runWithOrg } from "../../src/lib/db";
import { firmaHmac } from "../../src/lib/pagos/firmas";
import { cifrarCredencialPago } from "../../src/lib/pagos/credenciales";
import { guardarTokensOAuth } from "../../src/lib/pagos/oauth";
import { obtenerProveedorPago } from "../../src/lib/pagos/proveedor";
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
process.env.MERCADOPAGO_CLIENT_ID = "cliente-e2e";
process.env.MERCADOPAGO_CLIENT_SECRET = "secreto-oauth-e2e";
process.env.MERCADOPAGO_REDIRECT_URI = "http://localhost:3000/api/pagos/oauth/callback";
process.env.MERCADOPAGO_WEBHOOK_SECRET = "secreto-webhook-aplicacion-e2e";

const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
const orgA = 91n;
const orgB = 92n;

function evento(
  pagoId: bigint,
  id: string,
  monto = "100.00",
  moneda = "MXN",
  extra: { montoReembolsado?: string; contracargo?: boolean } = {},
) {
  return {
    eventoId: id,
    tipo: "payment.updated",
    pagoId: String(pagoId),
    referencia: `payment-${pagoId}`,
    estado: "aprobado" as const,
    monto,
    moneda,
    ...extra,
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
        webhookSecretEncrypted: null,
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
      /no se puede reembolsar|supera el monto disponible/,
    );

    await db.venta.update({ where: { id: pago.origenId }, data: { estado: "pendiente" } });
    const nuevoCobro = await crearCheckoutVenta(
      { orgId: orgA, userId: null, rol: "admin", puesto: "Administrador" },
      {
        origenTipo: "venta",
        origenId: String(pago.origenId),
        idempotencyKey: "venta:e2e:despues-reembolso",
      },
    );
    await procesarEventoPago(orgA, "mock", evento(nuevoCobro.id, "aprobado-despues-reembolso"));
    assert.equal(
      await db.pagoVenta.count({ where: { ventaId: pago.origenId, metodo: "mock" } }),
      1,
      "un pagoVenta previo se actualiza sin confundir el evento con un duplicado",
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
    const tardioGuardado = await db.pagoOnline.findUniqueOrThrow({ where: { id: tardio.id } });
    assert.equal(tardioGuardado.estado, "reembolsado", "el pago tardío se reembolsa automáticamente");
    assert.equal((tardioGuardado.metadata as { conflicto?: string }).conflicto, "venta_no_acreditable");

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
    assert.equal(
      (await db.pagoOnline.findUniqueOrThrow({ where: { id: segundoPago.id } })).estado,
      "reembolsado",
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
    assert.equal(
      (await db.pagoOnline.findUniqueOrThrow({ where: { id: pagoTotalOriginal.id } })).estado,
      "reembolsado",
    );

    const ventaAprobada = await db.venta.create({
      data: { folio: "V-APROBADA-CONFLICTO", total: "45.00", subtotal: "45.00", moneda: "MXN", estado: "pendiente" },
    });
    const pagoAprobado = await crearCheckoutVenta(sesion, {
      origenTipo: "venta", origenId: String(ventaAprobada.id), idempotencyKey: "venta:e2e:aprobada-conflicto",
    });
    await procesarEventoPago(orgA, "mock", evento(pagoAprobado.id, "aprobada-correcta", "45.00"));
    await procesarEventoPago(orgA, "mock", evento(pagoAprobado.id, "aprobada-monto-distinto", "44.00"));
    const aprobadoEnRevision = await db.pagoOnline.findUniqueOrThrow({ where: { id: pagoAprobado.id } });
    assert.equal(aprobadoEnRevision.estado, "aprobado", "un evento distinto no degrada un pago aprobado");
    assert.equal(
      (aprobadoEnRevision.metadata as { conflicto?: string }).conflicto,
      "monto_o_moneda_no_coinciden",
    );

    const ventaRefund = await db.venta.create({
      data: { folio: "V-WEBHOOK-REFUND", total: "90.00", subtotal: "90.00", moneda: "MXN", estado: "pendiente" },
    });
    const pagoRefund = await crearCheckoutVenta(sesion, {
      origenTipo: "venta", origenId: String(ventaRefund.id), idempotencyKey: "venta:e2e:webhook-refund",
    });
    await procesarEventoPago(orgA, "mock", evento(pagoRefund.id, "refund-base", "90.00"));
    await procesarEventoPago(orgA, "mock", evento(pagoRefund.id, "refund-parcial", "90.00", "MXN", { montoReembolsado: "30.00" }));
    assert.equal(
      (await db.pagoOnline.findUniqueOrThrow({ where: { id: pagoRefund.id } })).montoReembolsado.toFixed(2),
      "30.00",
    );
    await procesarEventoPago(orgA, "mock", evento(pagoRefund.id, "refund-total", "90.00", "MXN", { montoReembolsado: "90.00" }));
    assert.equal((await db.pagoOnline.findUniqueOrThrow({ where: { id: pagoRefund.id } })).estado, "reembolsado");

    const ventaContracargo = await db.venta.create({
      data: { folio: "V-CONTRACARGO", total: "25.00", subtotal: "25.00", moneda: "MXN", estado: "pendiente" },
    });
    const pagoContracargo = await crearCheckoutVenta(sesion, {
      origenTipo: "venta", origenId: String(ventaContracargo.id), idempotencyKey: "venta:e2e:contracargo",
    });
    await procesarEventoPago(orgA, "mock", evento(pagoContracargo.id, "contracargo-base", "25.00"));
    await procesarEventoPago(orgA, "mock", evento(pagoContracargo.id, "contracargo-evento", "25.00", "MXN", { contracargo: true }));
    const contracargo = await db.pagoOnline.findUniqueOrThrow({ where: { id: pagoContracargo.id } });
    assert.equal(contracargo.montoReembolsado.toFixed(2), "0.00");
    assert.equal((contracargo.metadata as { contracargo?: boolean }).contracargo, true);

    const ventaPendienteRefund = await db.venta.create({
      data: { folio: "V-REFUND-PENDIENTE", total: "20.00", subtotal: "20.00", moneda: "MXN", estado: "pendiente" },
    });
    const pagoPendienteRefund = await crearCheckoutVenta(sesion, {
      origenTipo: "venta", origenId: String(ventaPendienteRefund.id), idempotencyKey: "venta:e2e:refund-pendiente",
    });
    await procesarEventoPago(orgA, "mock", evento(pagoPendienteRefund.id, "refund-pendiente-base", "20.00"));
    await db.reembolsoPago.create({
      data: {
        pagoId: pagoPendienteRefund.id,
        monto: "20.00",
        referencia: "mock-refund-pendiente",
        idempotencyKey: "refund:e2e:pendiente-conciliar",
      },
    });

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
  assert.ok(conciliacion.reembolsosProcesados >= 1, "el cron concilia reembolsos pendientes");
  await runWithOrg(orgA, async () => {
    const conciliado = await db.pagoOnline.findFirstOrThrow({ where: { origenTipo: "venta", idempotencyKey: "venta:e2e:refund-pendiente" } });
    assert.equal(conciliado.estado, "reembolsado");
    assert.equal(conciliado.montoReembolsado.toFixed(2), "20.00");
  });
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

  await runWithOrg(orgA, () =>
    guardarTokensOAuth(orgA, {
      access_token: "access-org-a",
      refresh_token: "refresh-org-a",
      expires_in: 1,
      user_id: 1001,
      scope: "offline_access",
      live_mode: false,
    }),
  );
  await runWithOrg(orgB, () =>
    guardarTokensOAuth(orgB, {
      access_token: "access-org-b",
      refresh_token: "refresh-org-b",
      expires_in: 15_552_000,
      user_id: 1002,
      scope: "offline_access",
      live_mode: false,
    }),
  );
  const credencialesOAuth = await admin.query(
    "SELECT org_id, access_token_encrypted, refresh_token_encrypted, webhook_secret_encrypted FROM credenciales_pago WHERE proveedor = 'mercado_pago' ORDER BY org_id",
  );
  assert.equal(credencialesOAuth.rowCount, 2);
  assert.notEqual(credencialesOAuth.rows[0].access_token_encrypted, "access-org-a");
  assert.notEqual(credencialesOAuth.rows[0].refresh_token_encrypted, "refresh-org-a");
  assert.notEqual(
    credencialesOAuth.rows[0].access_token_encrypted,
    credencialesOAuth.rows[1].access_token_encrypted,
    "cada organización conserva tokens distintos",
  );
  assert.equal(credencialesOAuth.rows[0].webhook_secret_encrypted, null);

  const fetchReal = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        access_token: "access-org-a-renovado",
        refresh_token: "refresh-org-a-renovado",
        expires_in: 15_552_000,
        user_id: 1001,
        scope: "offline_access",
      }),
    );
  await runWithOrg(orgA, async () => {
    const proveedorRenovado = await obtenerProveedorPago(orgA);
    assert.equal(proveedorRenovado.clave, "mercado_pago", "un token próximo a vencer se renueva");
  });
  await runWithOrg(orgA, async () => {
    await db.credencialPago.updateMany({
      where: { proveedor: "mercado_pago" },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
  });
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: "invalid_grant" }), { status: 400 });
  await runWithOrg(orgA, async () => {
    await assert.rejects(obtenerProveedorPago(orgA), /volver a conectarse/);
    assert.equal(
      (await db.credencialPago.findFirstOrThrow({ where: { proveedor: "mercado_pago" } })).requiereReconexion,
      true,
      "un refresh inválido marca la conexión para reconectar",
    );
  });
  globalThis.fetch = fetchReal;
  console.log(
    "pagos-online E2E: OAuth multi-org/refresh, concurrencia, conflictos, reembolsos, webhook, cron y RLS OK",
  );
}

try {
  await main();
} finally {
  await admin.end();
  await dbRaw.$disconnect();
}
