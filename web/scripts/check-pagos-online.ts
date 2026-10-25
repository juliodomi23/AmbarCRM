import assert from "node:assert/strict";
import {
  firmaHmac,
  verificarFirmaMercadoPago,
  verificarFirmaMock,
} from "../src/lib/pagos/firmas";
import { ProveedorMock } from "../src/lib/pagos/mock";

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
  urlWebhook: "http://localhost:3000/api/public/pagos/webhook/mock?org=91",
  expiraAt: new Date(ahora + 60_000),
});
assert.match(checkout.url, /pago=10/);
assert.equal(
  (await proveedor.reembolsar("mock-payment-10")).estado,
  "aprobado",
);

console.log(
  "pagos-online: firmas válidas/incorrectas, replay, mock, checkout y reembolso OK",
);
