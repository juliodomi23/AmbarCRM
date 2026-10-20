// Uso: node --experimental-strip-types scripts/check-coexistencia-sync.ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { avisoSincronizacion, iniciarSincronizacionCoexistencia } from "../src/lib/meta/coexistencia.ts";

const llamadas: { url: string; auth: string | null; body: any }[] = [];
const fetchOriginal = globalThis.fetch;
function simular(respuestas: Array<{ status: number; json: unknown } | Error>) {
  llamadas.length = 0;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    llamadas.push({ url, auth: new Headers(init.headers).get("Authorization"), body: JSON.parse(String(init.body)) });
    const r = respuestas[llamadas.length - 1];
    if (r instanceof Error) throw r;
    return { ok: r.status < 400, status: r.status, json: async () => r.json } as Response;
  }) as typeof fetch;
}

// Contactos primero, historial después, al phone_number_id y con el token del canal.
simular([{ status: 200, json: { request_id: "R1", success: true } }, { status: 200, json: { request_id: "R2", success: true } }]);
const ok = await iniciarSincronizacionCoexistencia("https://graph.test/v26.0", "123", "tok");
assert.equal(llamadas.length, 2);
assert.equal(llamadas[0].url, "https://graph.test/v26.0/123/smb_app_data");
assert.deepEqual(llamadas.map((l) => l.body.sync_type), ["smb_app_state_sync", "history"]);
assert.ok(llamadas.every((l) => l.auth === "Bearer tok" && l.body.messaging_product === "whatsapp"));
assert.deepEqual([ok.contactos, ok.historial], [{ ok: true, requestId: "R1" }, { ok: true, requestId: "R2" }]);
assert.equal(avisoSincronizacion(ok), undefined);

// Un rechazo de Meta no tira el onboarding: queda en el resultado y genera aviso.
simular([{ status: 200, json: { request_id: "R1" } }, { status: 400, json: { error: { message: "ya sincronizado" } } }]);
const parcial = await iniciarSincronizacionCoexistencia("https://graph.test/v26.0", "123", "tok");
assert.equal(parcial.historial.ok, false);
assert.match(avisoSincronizacion(parcial)!, /historial \(ya sincronizado\)/);

// Fallo de red: no lanza.
simular([new Error("sin red"), new Error("sin red")]);
const caida = await iniciarSincronizacionCoexistencia("https://graph.test/v26.0", "123", "tok");
assert.deepEqual([caida.contactos.error, caida.historial.error], ["sin red", "sin red"]);
globalThis.fetch = fetchOriginal;

// La ruta de onboarding lo pide solo en Coexistence y después de guardar el canal.
const ruta = await readFile(new URL("../src/app/api/wa/onboard/route.ts", import.meta.url), "utf8");
assert.match(ruta, /coexistencia\s*\?\s*await iniciarSincronizacionCoexistencia/);
assert.ok(ruta.indexOf("iniciarSincronizacionCoexistencia(META") > ruta.indexOf("db.canalWhatsapp.create"));

console.log("coexistencia-sync OK");
