import assert from "node:assert/strict";
import {
  firmaHmac,
  verificarFirmaMercadoPago,
  verificarFirmaMock,
} from "../src/lib/pagos/firmas";
import { ProveedorMock } from "../src/lib/pagos/mock";

process.env.MERCADOPAGO_CLIENT_ID = "cliente-prueba";
process.env.MERCADOPAGO_CLIENT_SECRET = "secreto-oauth-prueba";
process.env.MERCADOPAGO_REDIRECT_URI =
  "http://localhost:3000/api/pagos/oauth/callback";

const {
  crearStateOAuth,
  intercambiarCodigoOAuth,
  refrescarTokensOAuth,
  urlAutorizacionMercadoPago,
  validarStateOAuth,
} = await import("../src/lib/pagos/oauth");
const { ProveedorMercadoPago } = await import("../src/lib/pagos/mercado-pago");

const ahora = Date.now();
const ts = String(ahora);
const dataId = "123456";
const requestId = "req-prueba";
const secret = "secreto-solo-prueba";
const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
const signature = `ts=${ts},v1=${firmaHmac(secret, manifest)}`;

assert.equal(
  verificarFirmaMercadoPago({ signature, requestId, dataId, secret, ahora }),
  true,
);
assert.equal(
  verificarFirmaMercadoPago({
    signature,
    requestId,
    dataId,
    secret: "incorrecto",
    ahora,
  }),
  false,
  "rechaza firma inválida",
);
assert.equal(
  verificarFirmaMercadoPago({
    signature,
    requestId,
    dataId,
    secret,
    ahora: ahora + 6 * 60_000,
  }),
  false,
  "rechaza replay fuera de ventana",
);

const cuerpo = JSON.stringify({
  eventoId: "evento-1",
  tipo: "payment.updated",
  pagoId: "10",
  referencia: "mock-payment-10",
  estado: "aprobado",
  monto: "100.00",
  moneda: "MXN",
  payload: { status: "approved" },
});
const firmaMock = firmaHmac(secret, `${ts}.${cuerpo}`);
assert.equal(
  verificarFirmaMock({
    cuerpo,
    timestamp: ts,
    firma: firmaMock,
    secret,
    ahora,
  }),
  true,
);
assert.equal(
  verificarFirmaMock({
    cuerpo: `${cuerpo} `,
    timestamp: ts,
    firma: firmaMock,
    secret,
    ahora,
  }),
  false,
);

const proveedor = new ProveedorMock(secret, "http://localhost:3000");
const evento = await proveedor.verificarWebhook(
  new Request("http://localhost/webhook", {
    method: "POST",
    headers: { "x-mock-timestamp": ts, "x-mock-signature": firmaMock },
    body: cuerpo,
  }),
);
assert.equal(evento?.estado, "aprobado");
await assert.rejects(
  proveedor.verificarWebhook(
    new Request("http://localhost/webhook", {
      method: "POST",
      headers: { "x-mock-timestamp": ts, "x-mock-signature": "mala" },
      body: cuerpo,
    }),
  ),
  /firma de webhook inválida/,
);

const checkout = await proveedor.crearCheckout({
  pagoId: "10",
  titulo: "Venta V-10",
  monto: "100.00",
  moneda: "MXN",
  idempotencyKey: "venta:10:100.00",
  urlResultado: "http://localhost:3000/pagos/resultado",
  urlWebhook: "http://localhost:3000/api/public/pagos/webhook/mock/91",
  expiraAt: new Date(ahora + 60_000),
});
assert.match(checkout.url, /pago=10/);
assert.equal(
  (await proveedor.reembolsar("mock-payment-10")).estado,
  "aprobado",
);

const estadoOAuth = crearStateOAuth(91n, 7n);
assert.equal(validarStateOAuth(estadoOAuth.state, estadoOAuth.nonce, 91n, 7n), true);
assert.equal(validarStateOAuth(estadoOAuth.state, "cookie-distinta", 91n, 7n), false);
assert.equal(validarStateOAuth(estadoOAuth.state, estadoOAuth.nonce, 92n, 7n), false);
assert.equal(
  validarStateOAuth(
    estadoOAuth.state,
    estadoOAuth.nonce,
    91n,
    7n,
    ahora + 11 * 60_000,
  ),
  false,
  "el state vence y no puede reutilizarse",
);
const autorizacion = urlAutorizacionMercadoPago(estadoOAuth.state);
assert.equal(autorizacion.searchParams.get("scope"), "offline_access");
assert.equal(autorizacion.searchParams.get("response_type"), "code");

const fetchReal = globalThis.fetch;
globalThis.fetch = async (_input, init) => {
  const solicitud = JSON.parse(String(init?.body ?? "{}")) as Record<string, string>;
  if (solicitud.code === "invalido")
    return new Response(JSON.stringify({ message: "invalid_grant" }), { status: 400 });
  return new Response(
    JSON.stringify({
      access_token:
        solicitud.grant_type === "refresh_token" ? "access-renovado" : "access-inicial",
      refresh_token: "refresh-renovado",
      expires_in: 15_552_000,
      user_id: 123,
      scope: "offline_access",
    }),
  );
};
await assert.rejects(intercambiarCodigoOAuth("invalido"), /rechazó la autorización/);
assert.equal((await intercambiarCodigoOAuth("valido")).access_token, "access-inicial");
assert.equal((await refrescarTokensOAuth("refresh-anterior")).access_token, "access-renovado");

async function eventoMercadoPago(status: string, reembolsado: number) {
  const dataIdMp = `mp-${status}-${reembolsado}`;
  const requestIdMp = `req-${dataIdMp}`;
  const timestampMp = String(Date.now());
  const secretMp = "secreto-aplicacion-mp";
  const firmaMp = `ts=${timestampMp},v1=${firmaHmac(
    secretMp,
    `id:${dataIdMp};request-id:${requestIdMp};ts:${timestampMp};`,
  )}`;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        id: dataIdMp,
        status,
        external_reference: "10",
        transaction_amount: 100,
        transaction_amount_refunded: reembolsado,
        currency_id: "MXN",
      }),
    );
  const proveedorMp = new ProveedorMercadoPago({
    accessToken: "access-prueba",
    webhookSecret: secretMp,
    sandbox: true,
  });
  return proveedorMp.verificarWebhook(
    new Request(`http://localhost/webhook?data.id=${dataIdMp}&type=payment`, {
      method: "POST",
      headers: { "x-request-id": requestIdMp, "x-signature": firmaMp },
      body: JSON.stringify({ id: requestIdMp, type: "payment", data: { id: dataIdMp } }),
    }),
  );
}

const parcialMp = await eventoMercadoPago("refunded", 40);
assert.equal(parcialMp?.estado, "aprobado");
assert.equal(parcialMp?.montoReembolsado, "40.00");
const totalMp = await eventoMercadoPago("refunded", 100);
assert.equal(totalMp?.estado, "reembolsado");
const contracargoMp = await eventoMercadoPago("charged_back", 0);
assert.equal(contracargoMp?.contracargo, true);
assert.equal(contracargoMp?.estado, "aprobado");
globalThis.fetch = fetchReal;

console.log(
  "pagos-online: firmas, OAuth/CSRF/refresh, mock y reembolsos MP parcial/total/contracargo OK",
);
