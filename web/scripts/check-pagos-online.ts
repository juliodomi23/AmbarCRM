import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
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
process.env.MERCADOPAGO_SANDBOX = "1";
process.env.MERCADOPAGO_TEST_TOKEN = "1";
process.env.MERCADOPAGO_PKCE = "0";
process.env.PAGOS_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString("base64");

const {
  crearStateOAuth,
  intercambiarCodigoOAuth,
  leerCookieOAuth,
  refrescarTokensOAuth,
  urlAutorizacionMercadoPago,
  validarStateOAuth,
} = await import("../src/lib/pagos/oauth");
const { ProveedorMercadoPago } = await import("../src/lib/pagos/mercado-pago");
const { ProveedorStripe, montoAMinorUnits, minorUnitsAMonto, expiracionCheckoutStripe, crearAccountLink, crearCuentaStripe, consultarCuentaStripe } = await import("../src/lib/pagos/stripe");

assert.equal(montoAMinorUnits("1500.00"), 150000);
assert.equal(montoAMinorUnits("0.50"), 50);
assert.equal(montoAMinorUnits("99999.99"), 9999999);
assert.equal(minorUnitsAMonto(9999999), "99999.99");
assert.throws(() => montoAMinorUnits("0.001"));

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
const { crearStatePago, validarStatePago } = await import("../src/lib/pagos/oauth");
const estadoStripe = crearStatePago(91n, 7n, "stripe");
assert.equal(validarStatePago(estadoStripe.state, estadoStripe.nonce, 91n, 7n, "stripe"), true);
assert.equal(validarStatePago(estadoStripe.state, estadoStripe.nonce, 91n, 7n, "mercado_pago"), false);
assert.equal(validarStatePago(estadoStripe.state, estadoStripe.nonce, 91n, 7n, "stripe", ahora + 11 * 60_000), false);
assert.equal(validarStatePago(estadoStripe.state, "nonce-invalido", 91n, 7n, "stripe"), false);
const autorizacion = urlAutorizacionMercadoPago(estadoOAuth.state);
assert.equal(autorizacion.searchParams.get("scope"), "offline_access");
assert.equal(autorizacion.searchParams.get("response_type"), "code");
assert.equal(autorizacion.searchParams.get("platform_id"), "mp");

const fetchReal = globalThis.fetch;
const solicitudesOAuth: Array<Record<string, string>> = [];
globalThis.fetch = async (_input, init) => {
  const solicitud = JSON.parse(String(init?.body ?? "{}")) as Record<string, string>;
  solicitudesOAuth.push(solicitud);
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
assert.equal(solicitudesOAuth.at(-1)?.test_token, "true");
assert.equal((await refrescarTokensOAuth("refresh-anterior")).access_token, "access-renovado");

process.env.MERCADOPAGO_PKCE = "1";
const estadoPkce = crearStateOAuth(91n, 7n);
const cookiePkce = leerCookieOAuth(estadoPkce.cookie);
assert.ok(cookiePkce?.codeVerifier);
const autorizacionPkce = urlAutorizacionMercadoPago(
  estadoPkce.state,
  estadoPkce.codeChallenge,
);
assert.equal(autorizacionPkce.searchParams.get("code_challenge_method"), "S256");
assert.equal(
  autorizacionPkce.searchParams.get("code_challenge"),
  estadoPkce.codeChallenge,
);
await intercambiarCodigoOAuth("valido-pkce", cookiePkce?.codeVerifier);
assert.equal(solicitudesOAuth.at(-1)?.code_verifier, cookiePkce?.codeVerifier);
process.env.MERCADOPAGO_PKCE = "0";

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
const sinMontoMp = await eventoMercadoPago("refunded", 0);
assert.equal(sinMontoMp?.estado, "reembolsado");
const contracargoMp = await eventoMercadoPago("charged_back", 0);
assert.equal(contracargoMp?.contracargo, true);
assert.equal(contracargoMp?.estado, "aprobado");
globalThis.fetch = fetchReal;

const stripe = new ProveedorStripe({ secretKey: "sk_test_fake", webhookSecret: "whsec_fake", accountId: "acct_123test", sandbox: true });
const sesionesPorClave = new Map<string, { id: string; url: string; expires_at: number }>();
let creacionesSesion = 0;
globalThis.fetch = async (_input, init) => {
  const headers = new Headers(init?.headers);
  assert.equal(headers.get("Authorization"), "Bearer sk_test_fake");
  assert.equal(headers.get("Stripe-Account"), "acct_123test");
  const campos = new URLSearchParams(String(init?.body ?? ""));
  assert.equal(campos.get("mode"), "payment");
  assert.equal(campos.get("currency"), "mxn");
  assert.equal(campos.get("payment_method_types[0]"), "card", "OXXO y SPEI no se habilitan");
  assert.equal(campos.get("metadata[pagoId]"), "pago-42");
  assert.equal(campos.get("line_items[0][price_data][unit_amount]"), "150000");
  assert.equal(campos.get("line_items[0][price_data][product_data][description]"), "Venta V-42 · Cliente: Ana Pérez");
  const expiraAt = Number(campos.get("expires_at"));
  const segundosHastaExpirar = expiraAt - Math.floor(Date.now() / 1000);
  assert.ok(segundosHastaExpirar >= 30 * 60, "Checkout no vence antes de 30 minutos");
  assert.ok(segundosHastaExpirar <= 24 * 60 * 60, "Checkout no supera 24 horas");
  const key = headers.get("Idempotency-Key") ?? "";
  if (!sesionesPorClave.has(key)) {
    creacionesSesion++;
    sesionesPorClave.set(key, { id: "cs_test_42", url: "https://checkout.stripe.test/cs_test_42", expires_at: expiraAt });
  }
  return new Response(JSON.stringify(sesionesPorClave.get(key)));
};
const datosStripe = {
  pagoId: "pago-42", titulo: "Venta V-42 · Ana Pérez", descripcion: "Venta V-42 · Cliente: Ana Pérez", monto: "1500.00", moneda: "MXN", idempotencyKey: "venta:42:checkout",
  urlResultado: "https://crm.test/pagos/resultado", urlWebhook: "https://crm.test/api/public/pagos/webhook/stripe/91", expiraAt: new Date(Date.now() + 60 * 60_000),
};
assert.equal((await stripe.crearCheckout(datosStripe)).referencia, "cs_test_42");
assert.equal((await stripe.crearCheckout(datosStripe)).referencia, "cs_test_42");
assert.equal(creacionesSesion, 1, "la misma clave de idempotencia reutiliza la Checkout Session");
const ahoraPruebaStripe = Date.now();
assert.equal(expiracionCheckoutStripe(ahoraPruebaStripe) - Math.floor(ahoraPruebaStripe / 1000), 23 * 60 * 60, "Stripe recibe una expiración segura de 23 horas");

function webhookStripe(eventoStripe: Record<string, unknown>, timestamp = Math.floor(Date.now() / 1000), secreto = "whsec_fake") {
  const raw = JSON.stringify(eventoStripe);
  const firma = createHmac("sha256", secreto).update(`${timestamp}.${raw}`).digest("hex");
  return new Request("https://crm.test/api/public/pagos/webhook/stripe/91", { method: "POST", headers: { "Stripe-Signature": `t=${timestamp},v1=${firma}` }, body: raw });
}
const eventoCheckout = { id: "evt_checkout_42", type: "checkout.session.completed", account: "acct_123test", data: { object: { id: "cs_test_42", payment_intent: "pi_test_42", client_reference_id: "pago-42", metadata: { pagoId: "pago-42" }, amount_total: 150000, currency: "mxn", payment_status: "paid" } } };
const aprobadoStripe = await stripe.verificarWebhook(webhookStripe(eventoCheckout));
assert.equal(aprobadoStripe?.estado, "aprobado");
assert.equal(aprobadoStripe?.referencia, "pi_test_42");
assert.equal(aprobadoStripe?.monto, "1500.00");
await assert.rejects(stripe.verificarWebhook(new Request("https://crm.test/webhook", { method: "POST", headers: { "Stripe-Signature": "t=1,v1=invalid" }, body: JSON.stringify(eventoCheckout) })), /firma de webhook inválida/);
await assert.rejects(stripe.verificarWebhook(webhookStripe(eventoCheckout, Math.floor(Date.now() / 1000) - 600)), /firma de webhook inválida/);
await assert.rejects(stripe.verificarWebhook(webhookStripe({ ...eventoCheckout, account: "acct_otraorg" })), /cuenta conectada no corresponde/);
globalThis.fetch = async () => new Response(JSON.stringify({ id: "acct_123test", charges_enabled: true, details_submitted: false }));
const cuentaActualizada = await stripe.verificarWebhook(webhookStripe({ id: "evt_account_updated", type: "account.updated", account: "acct_123test", data: { object: { id: "acct_123test" } } }));
assert.equal(cuentaActualizada?.cuenta?.chargesEnabled, true);
assert.equal(cuentaActualizada?.cuenta?.detailsSubmitted, false);
const desautorizada = await stripe.verificarWebhook(webhookStripe({ id: "evt_deauthorized", type: "account.application.deauthorized", account: "acct_123test", data: { object: { id: "acct_123test" } } }));
assert.equal(desautorizada?.cuenta?.desautorizada, true);
for (const [tipo, estadoEsperado] of [["checkout.session.async_payment_failed", "rechazado"], ["checkout.session.async_payment_succeeded", "aprobado"], ["checkout.session.expired", "cancelado"]] as const) {
  const resultado = await stripe.verificarWebhook(webhookStripe({ ...eventoCheckout, id: `evt_${tipo}`, type: tipo, data: { object: { ...(eventoCheckout.data.object), payment_status: "unpaid" } } }));
  assert.equal(resultado?.estado, estadoEsperado, `${tipo} mapea a ${estadoEsperado}`);
}
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.endsWith("/v1/charges/ch_test_42")) return new Response(JSON.stringify({ id: "ch_test_42", payment_intent: "pi_test_42" }));
  if (url.endsWith("/v1/payment_intents/pi_test_42")) return new Response(JSON.stringify({ id: "pi_test_42", amount: 150000, currency: "mxn", metadata: { pagoId: "pago-42" } }));
  if (url.endsWith("/v1/refunds")) {
    const campos = new URLSearchParams(String(init?.body ?? ""));
    assert.equal(campos.get("payment_intent"), "pi_test_42");
    assert.equal(campos.get("amount"), "5000");
    assert.equal(new Headers(init?.headers).get("Idempotency-Key"), "refund:42:partial");
    return new Response(JSON.stringify({ id: "re_test_42", status: "succeeded" }));
  }
  if (url.endsWith("/v1/refunds/re_test_42")) return new Response(JSON.stringify({ id: "re_test_42", status: "pending" }));
  if (url.endsWith("/v1/accounts/acct_123test")) return new Response(JSON.stringify({ id: "acct_123test", charges_enabled: false, details_submitted: false }));
  if (url.endsWith("/v1/accounts")) {
    const campos = new URLSearchParams(String(init?.body ?? ""));
    assert.equal(campos.get("type"), "standard");
    assert.equal(campos.get("country"), "MX");
    return new Response(JSON.stringify({ id: "acct_test_nuevo", charges_enabled: false, details_submitted: false }));
  }
  if (url.endsWith("/v1/account_links")) {
    const campos = new URLSearchParams(String(init?.body ?? ""));
    assert.equal(campos.get("type"), "account_onboarding");
    assert.match(campos.get("refresh_url") ?? "", /state=/);
    assert.match(campos.get("return_url") ?? "", /state=/);
    return new Response(JSON.stringify({ url: "https://connect.stripe.test/link" }));
  }
  throw new Error(`fetch Stripe inesperado: ${url}`);
};
const reembolsoParcialStripe = await stripe.reembolsar("pi_test_42", "50.00", "refund:42:partial");
assert.equal(reembolsoParcialStripe.estado, "aprobado");
assert.equal((await stripe.consultarReembolso("pi_test_42", "re_test_42")).estado, "pendiente");
const cobroDevueltoStripe = await stripe.verificarWebhook(webhookStripe({ id: "evt_refund_42", type: "charge.refunded", account: "acct_123test", data: { object: { id: "ch_test_42", payment_intent: "pi_test_42", amount: 150000, amount_refunded: 5000, currency: "mxn" } } }));
assert.equal(cobroDevueltoStripe?.montoReembolsado, "50.00");
const disputaStripe = await stripe.verificarWebhook(webhookStripe({ id: "evt_dispute_42", type: "charge.dispute.created", account: "acct_123test", data: { object: { id: "dp_test_42", charge: "ch_test_42" } } }));
assert.equal(disputaStripe?.contracargo, true);
assert.equal((await consultarCuentaStripe("sk_test_fake", "acct_123test")).chargesEnabled, false);
assert.deepEqual(await crearCuentaStripe("sk_test_fake", "acct-idempotency", "MX"), { id: "acct_test_nuevo", charges_enabled: false, details_submitted: false });
assert.equal(await crearAccountLink("sk_test_fake", "acct_123test", "https://crm.test/refresh?state=x", "https://crm.test/return?state=x", "link-idempotency"), "https://connect.stripe.test/link");
globalThis.fetch = fetchReal;

console.log(
  "pagos-online: firmas, OAuth y regresión MP, centavos y Checkout/Webhooks Connect Stripe OK",
);
