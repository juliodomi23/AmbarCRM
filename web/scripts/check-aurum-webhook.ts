import assert from "node:assert/strict";
import { NextRequest } from "next/server";

process.env.AURUM_WEBHOOK_SECRET = "secreto-de-prueba-aurum";
const { POST } = await import("../src/app/api/public/aurum/webhook/route");

// Un evento no soportado: con el secreto correcto responde 200 sin tocar la BD ni a Aurum.
const llamar = (url: string, headers: Record<string, string> = {}) =>
  POST(new NextRequest(`http://crm.test/api/public/aurum/webhook${url}`, { method: "POST", headers, body: JSON.stringify({ event: "otro" }) }));
const estado = async (r: Response) => ({ status: r.status, cuerpo: await r.json() });

assert.equal((await llamar("")).status, 401, "sin secreto");
assert.equal((await llamar("?clave=mal")).status, 401, "query incorrecta");
assert.equal((await llamar("", { "x-aurum-clave": "mal" })).status, 401, "header incorrecto");
assert.equal((await llamar("", { "x-aurum-clave": "secreto-de-prueba-aurum-extra" })).status, 401, "otro largo");
assert.equal((await llamar("", { "x-aurum-clave": "" })).status, 401, "header vacío");
const ok = { status: 200, cuerpo: { ok: true, ignorado: "evento no soportado" } };
assert.deepEqual(await estado(await llamar("", { "x-aurum-clave": "secreto-de-prueba-aurum" })), ok, "header correcto");
assert.deepEqual(await estado(await llamar("?clave=secreto-de-prueba-aurum")), ok, "query correcta (compatibilidad)");
// El header manda sobre la query: un header malo no se rescata con una query buena.
assert.equal((await llamar("?clave=secreto-de-prueba-aurum", { "x-aurum-clave": "mal" })).status, 401);
delete process.env.AURUM_WEBHOOK_SECRET;
assert.equal((await llamar("", { "x-aurum-clave": "" })).status, 401, "sin secreto configurado nada pasa");
assert.equal((await llamar("?clave=")).status, 401);
console.log("aurum webhook: header x-aurum-clave y ?clave= válidos, secretos incorrectos o vacíos rechazados OK");
