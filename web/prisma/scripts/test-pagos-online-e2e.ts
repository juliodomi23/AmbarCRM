import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import pg from "pg";
import { NextRequest } from "next/server";
import { db, dbRaw, runWithOrg } from "../../src/lib/db";
import { firmaHmac } from "../../src/lib/pagos/firmas";
import { cifrarCredencialPago } from "../../src/lib/pagos/credenciales";
import { guardarTokensOAuth } from "../../src/lib/pagos/oauth";
import { obtenerProveedorPago } from "../../src/lib/pagos/proveedor";
import { ProveedorMock } from "../../src/lib/pagos/mock";
import { crearStatePago, validarStatePago } from "../../src/lib/pagos/oauth";
import { POST as webhookPOST } from "../../src/app/api/public/pagos/webhook/[proveedor]/[org]/route";
import { POST as webhookStripeConnect } from "../../src/app/api/public/pagos/webhook/stripe/route";
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
process.env.STRIPE_SECRET_KEY = "sk_test_e2e";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_e2e";
process.env.STRIPE_PAIS = "MX";

const stateStripe = crearStatePago(91n, 7n, "stripe");
assert.equal(validarStatePago(stateStripe.state, stateStripe.nonce, 91n, 7n, "stripe"), true);
assert.equal(validarStatePago(stateStripe.state, "nonce-invalid", 91n, 7n, "stripe"), false, "state con nonce incorrecto se rechaza");
assert.equal(validarStatePago(stateStripe.state, stateStripe.nonce, 91n, 7n, "stripe", Date.now() + 11 * 60_000), false, "state vencido se rechaza");

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
    assert.equal(
      (tardioGuardado.metadata as { conflicto?: unknown }).conflicto,
      null,
      "el conflicto queda resuelto al completar el reembolso",
    );
    assert.equal(
      (tardioGuardado.metadata as { conflictoResuelto?: string }).conflictoResuelto,
      "venta_no_acreditable",
    );
    assert.equal(
      (tardioGuardado.metadata as { requiereReembolso?: boolean }).requiereReembolso,
      false,
    );

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

    const ventaErrorRed = await db.venta.create({
      data: { folio: "V-REFUND-RED", total: "32.00", subtotal: "32.00", moneda: "MXN", estado: "pendiente" },
    });
    const pagoErrorRed = await crearCheckoutVenta(sesion, {
      origenTipo: "venta", origenId: String(ventaErrorRed.id), idempotencyKey: "venta:e2e:refund-red",
    });
    await procesarEventoPago(orgA, "mock", evento(pagoErrorRed.id, "refund-red-base", "32.00"));
    const reembolsarMockOriginal = ProveedorMock.prototype.reembolsar;
    const clavesRecibidas: string[] = [];
    let primeraRespuestaPerdida = true;
    ProveedorMock.prototype.reembolsar = async function (
      _referencia,
      _monto,
      clave,
    ) {
      clavesRecibidas.push(clave ?? "");
      if (primeraRespuestaPerdida) {
        primeraRespuestaPerdida = false;
        throw new Error("timeout después de procesar");
      }
      return { referencia: "mock-refund-red-unico", estado: "aprobado" };
    };
    const pendientePorRed = await reembolsarPago(
      sesion,
      pagoErrorRed.id,
      "32.00",
      "refund:e2e:error-red",
    );
    assert.equal(pendientePorRed.estado, "pendiente");
    assert.match(pendientePorRed.ultimoError ?? "", /timeout/);
    const recuperado = await reembolsarPago(
      sesion,
      pagoErrorRed.id,
      "32.00",
      "refund:e2e:error-red",
    );
    assert.equal(recuperado.estado, "aprobado");
    assert.deepEqual(
      clavesRecibidas,
      ["refund:e2e:error-red", "refund:e2e:error-red"],
      "el reintento conserva la misma clave de idempotencia",
    );
    assert.equal(
      (await db.pagoOnline.findUniqueOrThrow({ where: { id: pagoErrorRed.id } })).montoReembolsado.toFixed(2),
      "32.00",
    );

    const ventaRechazoRefund = await db.venta.create({
      data: { folio: "V-REFUND-RECHAZADO", total: "18.00", subtotal: "18.00", moneda: "MXN", estado: "pendiente" },
    });
    const pagoRechazoRefund = await crearCheckoutVenta(sesion, {
      origenTipo: "venta", origenId: String(ventaRechazoRefund.id), idempotencyKey: "venta:e2e:refund-rechazado",
    });
    await procesarEventoPago(orgA, "mock", evento(pagoRechazoRefund.id, "refund-rechazado-base", "18.00"));
    ProveedorMock.prototype.reembolsar = async () => ({
      referencia: "mock-refund-rechazado",
      estado: "rechazado",
    });
    const rechazadoProveedor = await reembolsarPago(
      sesion,
      pagoRechazoRefund.id,
      "18.00",
      "refund:e2e:rechazo-explicito",
    );
    assert.equal(rechazadoProveedor.estado, "rechazado");
    assert.equal(
      (await db.pagoOnline.findUniqueOrThrow({ where: { id: pagoRechazoRefund.id } })).montoReembolsado.toFixed(2),
      "0.00",
    );
    ProveedorMock.prototype.reembolsar = reembolsarMockOriginal;

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
    await db.pagoOnline.update({
      where: { id: pagoRefund.id },
      data: {
        metadata: {
          conflicto: "venta_no_acreditable",
          requiereReembolso: true,
          motivoConflicto: "Conflicto de prueba",
        },
      },
    });
    await procesarEventoPago(orgA, "mock", evento(pagoRefund.id, "refund-total", "90.00", "MXN", { montoReembolsado: "90.00" }));
    const refundTotal = await db.pagoOnline.findUniqueOrThrow({ where: { id: pagoRefund.id } });
    assert.equal(refundTotal.estado, "reembolsado");
    assert.equal((refundTotal.metadata as { conflicto?: unknown }).conflicto, null);
    assert.equal((refundTotal.metadata as { requiereReembolso?: boolean }).requiereReembolso, false);

    const ventaRefundSinMonto = await db.venta.create({
      data: { folio: "V-REFUND-SIN-MONTO", total: "26.00", subtotal: "26.00", moneda: "MXN", estado: "pendiente" },
    });
    const pagoRefundSinMonto = await crearCheckoutVenta(sesion, {
      origenTipo: "venta", origenId: String(ventaRefundSinMonto.id), idempotencyKey: "venta:e2e:refund-sin-monto",
    });
    await procesarEventoPago(orgA, "mock", evento(pagoRefundSinMonto.id, "refund-sin-monto-base", "26.00"));
    await procesarEventoPago(orgA, "mock", {
      ...evento(pagoRefundSinMonto.id, "refund-sin-monto", "26.00"),
      estado: "reembolsado",
      montoReembolsado: "0.00",
    });
    const sinMonto = await db.pagoOnline.findUniqueOrThrow({ where: { id: pagoRefundSinMonto.id } });
    assert.equal(sinMonto.estado, "aprobado");
    assert.equal((sinMonto.metadata as { conflicto?: string }).conflicto, "reembolso_sin_monto");
    assert.equal(
      await db.tarea.count({ where: { titulo: { startsWith: `[Pago ${pagoRefundSinMonto.id}]` } } }),
      1,
    );

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
  assert.equal(orgIncorrecta.status, 404, "la ruta no revela ni reutiliza credenciales de otra organización sin conexión local");
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
    await db.moduloOrg.updateMany({ where: { clave: "pagos_en_linea" }, data: { config: { proveedor: "mercado_pago" } } });
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

  let sesionesStripe = 0;
  let estadoCuentaStripe = { charges_enabled: false, details_submitted: false };
  const reembolsosStripe = new Map<string, { id: string; status: string }>();
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/v1/checkout/sessions")) {
      sesionesStripe++;
      const campos = new URLSearchParams(String(init?.body ?? ""));
      assert.equal(campos.get("line_items[0][price_data][unit_amount]"), "3333");
      assert.ok(campos.get("line_items[0][price_data][product_data][description]"), "Stripe recibe la descripción del cobro");
      assert.equal(campos.get("payment_method_types[0]"), "card");
      const segundosHastaExpirar = Number(campos.get("expires_at")) - Math.floor(Date.now() / 1000);
      assert.ok(segundosHastaExpirar >= 30 * 60 && segundosHastaExpirar <= 24 * 60 * 60, "Checkout respeta la ventana de expiración de Stripe");
      return new Response(JSON.stringify({ id: "cs_e2e_stripe_1", url: "https://checkout.stripe.test/e2e", expires_at: Math.floor(Date.now() / 1000) + 3600 }));
    }
    if (url.endsWith("/v1/accounts/acct_e2e123")) {
      return new Response(JSON.stringify({ id: "acct_e2e123", ...estadoCuentaStripe }));
    }
    if (url.endsWith("/v1/refunds")) {
      const headers = new Headers(init?.headers);
      const key = headers.get("Idempotency-Key") ?? "";
      const existente = reembolsosStripe.get(key);
      if (existente) return new Response(JSON.stringify(existente));
      const resultado = { id: `re_${reembolsosStripe.size + 1}`, status: "succeeded" };
      reembolsosStripe.set(key, resultado);
      return new Response(JSON.stringify(resultado));
    }
    if (url.includes("/v1/refunds/")) return new Response(JSON.stringify({ id: "re_1", status: "succeeded" }));
    throw new Error(`fetch inesperado en E2E Stripe: ${url}`);
  };
  await runWithOrg(orgA, async () => {
    await db.credencialPago.upsert({
      where: { orgId_proveedor: { orgId: orgA, proveedor: "stripe" } },
      create: { proveedor: "stripe", proveedorUserId: "acct_e2e123", accessTokenEncrypted: null, refreshTokenEncrypted: null, webhookSecretEncrypted: null, sandbox: true, activo: true, stripeChargesEnabled: false, stripeDetailsSubmitted: false },
      update: { proveedorUserId: "acct_e2e123", sandbox: true, activo: true, requiereReconexion: false, stripeChargesEnabled: false, stripeDetailsSubmitted: false },
    });
    await db.moduloOrg.updateMany({ where: { clave: "pagos_en_linea" }, data: { config: { proveedor: "stripe" } } });
    await assert.rejects(obtenerProveedorPago(orgA), /Falta completar datos en Stripe/, "no permite cobrar durante onboarding incompleto");
  });
  await runWithOrg(orgB, async () => {
    assert.equal(await db.credencialPago.count({ where: { proveedor: "stripe" } }), 0, "RLS no expone la conexión Stripe de la organización A");
    assert.equal(await db.pagoOnline.count({ where: { proveedor: "stripe" } }), 0, "RLS no expone los pagos Stripe de la organización A");
  });

  async function stripeRequest(eventoStripe: Record<string, unknown>, opts: { firma?: boolean; timestamp?: number; rutaGlobal?: boolean } = {}) {
    const cuerpo = JSON.stringify(eventoStripe);
    const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000);
    const firma = createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET!).update(`${timestamp}.${cuerpo}`).digest("hex");
    const req = new NextRequest("http://localhost/api/public/pagos/webhook/stripe/91", {
      method: "POST",
      headers: { "Stripe-Signature": opts.firma === false ? `t=${timestamp},v1=invalid` : `t=${timestamp},v1=${firma}` },
      body: cuerpo,
    });
    return opts.rutaGlobal ? webhookStripeConnect(req) : webhookPOST(req, { params: Promise.resolve({ proveedor: "stripe", org: "91" }) });
  }
  const accountEvent = (id: string, type: string, account = "acct_e2e123") => ({ id, type, account, data: { object: { id: account } } });
  const incompleto = await stripeRequest(accountEvent("evt_acct_incompleto", "account.updated"));
  assert.equal(incompleto.status, 200, JSON.stringify(await incompleto.clone().json()));
  await runWithOrg(orgA, async () => {
    const guardada = await db.credencialPago.findUniqueOrThrow({ where: { orgId_proveedor: { orgId: orgA, proveedor: "stripe" } } });
    assert.equal(guardada.stripeChargesEnabled, false, "onboarding incompleto conserva cobros bloqueados");
    assert.equal(guardada.stripeDetailsSubmitted, false);
    await assert.rejects(obtenerProveedorPago(orgA), /Falta completar datos en Stripe/);
  });
  estadoCuentaStripe = { charges_enabled: true, details_submitted: true };
  const cuentaLista = await stripeRequest(accountEvent("evt_acct_habilitada", "account.updated"), { rutaGlobal: true });
  assert.equal(cuentaLista.status, 200);
  await runWithOrg(orgA, async () => {
    const guardada = await db.credencialPago.findUniqueOrThrow({ where: { orgId_proveedor: { orgId: orgA, proveedor: "stripe" } } });
    assert.equal(guardada.stripeChargesEnabled, true, "account.updated habilita cobros solo con charges_enabled");
    assert.equal(guardada.stripeDetailsSubmitted, true);
  });
  const invalidaStripe = await stripeRequest(accountEvent("evt_acct_firma_invalida", "account.updated"), { firma: false });
  assert.equal(invalidaStripe.status, 401, "firma inválida no cambia la conexión");
  const vencidaStripe = await stripeRequest(accountEvent("evt_acct_firma_vencida", "account.updated"), { timestamp: Math.floor(Date.now() / 1000) - 600 });
  assert.equal(vencidaStripe.status, 401, "firma vencida no cambia la conexión");
  const cuentaAjena = await stripeRequest(accountEvent("evt_acct_ajena", "account.updated", "acct_otraorg"));
  assert.equal(cuentaAjena.status, 400, "rechaza evento de otra cuenta conectada");

  const stripeSesion = { orgId: orgA, userId: null, rol: "admin", puesto: "Administrador" };
  const ventaStripe = await runWithOrg(orgA, async () => db.venta.create({ data: { folio: "V-STRIPE-1", total: "33.33", subtotal: "33.33", moneda: "MXN", estado: "pendiente" } }));
  const pagoStripe = await runWithOrg(orgA, () => crearCheckoutVenta(stripeSesion, { origenTipo: "venta", origenId: String(ventaStripe.id), idempotencyKey: "venta:e2e:stripe-1" }));
  const pagoStripeRepetido = await runWithOrg(orgA, () => crearCheckoutVenta(stripeSesion, { origenTipo: "venta", origenId: String(ventaStripe.id), idempotencyKey: "venta:e2e:stripe-1" }));
  assert.equal(pagoStripeRepetido.id, pagoStripe.id);
  assert.equal(sesionesStripe, 1, "reintento con misma clave no crea otra sesión Stripe");
  const stripeEventoPago = (id: string, type: string, pagoId: bigint, estado = "paid") => ({ id, type, account: "acct_e2e123", data: { object: { id: `cs_${pagoId}`, payment_intent: `pi_${pagoId}`, client_reference_id: String(pagoId), metadata: { pagoId: String(pagoId) }, amount_total: 3333, currency: "mxn", payment_status: estado } } });
  const aprobadoStripe = await stripeRequest(stripeEventoPago("evt_stripe_aprobado", "checkout.session.completed", pagoStripe.id));
  assert.equal(aprobadoStripe.status, 200);
  const duplicadoStripe = await stripeRequest(stripeEventoPago("evt_stripe_aprobado", "checkout.session.completed", pagoStripe.id));
  assert.equal((await duplicadoStripe.json()).duplicado, true, "Stripe deduplica el evento repetido");
  await runWithOrg(orgA, async () => {
    assert.equal((await db.pagoOnline.findUniqueOrThrow({ where: { id: pagoStripe.id } })).estado, "aprobado");
    assert.equal(await db.pagoVenta.count({ where: { ventaId: ventaStripe.id } }), 1);
  });

  for (const caso of [
    { folio: "V-STRIPE-ASYNC", id: "venta:e2e:stripe-async", event: "checkout.session.async_payment_failed", expected: "rechazado" },
    { folio: "V-STRIPE-EXPIRED", id: "venta:e2e:stripe-expired", event: "checkout.session.expired", expected: "cancelado" },
  ]) {
    const venta = await runWithOrg(orgA, async () => db.venta.create({ data: { folio: caso.folio, total: "33.33", subtotal: "33.33", moneda: "MXN", estado: "pendiente" } }));
    const registro = await runWithOrg(orgA, () => crearCheckoutVenta(stripeSesion, { origenTipo: "venta", origenId: String(venta.id), idempotencyKey: caso.id }));
    const respuesta = await stripeRequest(stripeEventoPago(`evt_${caso.event}`, caso.event, registro.id, "unpaid"));
    assert.equal(respuesta.status, 200);
    await runWithOrg(orgA, async () => assert.equal((await db.pagoOnline.findUniqueOrThrow({ where: { id: registro.id } })).estado, caso.expected));
  }

  await runWithOrg(orgA, () => db.moduloOrg.updateMany({ where: { clave: "pagos_en_linea" }, data: { config: { proveedor: "mock" } } }));
  const parcialStripe = await runWithOrg(orgA, () => reembolsarPago(stripeSesion, pagoStripe.id, "10.00", "refund:e2e:stripe-partial"));
  assert.equal(parcialStripe.estado, "aprobado", "reembolso usa Stripe aunque cambie el proveedor predeterminado");
  const parcialStripeRepetido = await runWithOrg(orgA, () => reembolsarPago(stripeSesion, pagoStripe.id, "10.00", "refund:e2e:stripe-partial"));
  assert.equal(parcialStripeRepetido.id, parcialStripe.id, "reembolso Stripe idempotente");
  await runWithOrg(orgA, () => reembolsarPago(stripeSesion, pagoStripe.id, "23.33", "refund:e2e:stripe-resto"));
  await runWithOrg(orgA, async () => {
    const completo = await db.pagoOnline.findUniqueOrThrow({ where: { id: pagoStripe.id } });
    assert.equal(completo.estado, "reembolsado");
    assert.equal(completo.montoReembolsado.toFixed(2), "33.33");
  });
  const desconectada = await stripeRequest(accountEvent("evt_stripe_deauthorized", "account.application.deauthorized"));
  assert.equal(desconectada.status, 200);
  await runWithOrg(orgA, async () => {
    const actualizada = await db.credencialPago.findUniqueOrThrow({ where: { orgId_proveedor: { orgId: orgA, proveedor: "stripe" } } });
    assert.equal(actualizada.requiereReconexion, true, "deauthorized marca Stripe para reconectar");
    assert.equal(actualizada.stripeChargesEnabled, false);
    const proveedorMock = await obtenerProveedorPago(orgA);
    assert.equal(proveedorMock.clave, "mock", "el proveedor predeterminado por org cambia de forma independiente");
    const stripeDirecto = await obtenerProveedorPago(orgA, "stripe", { webhook: true });
    assert.equal(stripeDirecto.clave, "stripe", "la conexión antigua sigue resolviéndose para auditar webhooks");
  });
  globalThis.fetch = fetchReal;
  console.log(
    "pagos-online E2E: regresión MP, Stripe Standard/Account Links, webhooks, estados, reembolsos, multi-proveedor y RLS OK",
  );
}

try {
  await main();
} finally {
  await admin.end();
  await dbRaw.$disconnect();
}
