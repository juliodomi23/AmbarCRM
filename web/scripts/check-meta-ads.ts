import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ErrorMarketing, faltantesRevision, validarCamposCampana } from "../src/lib/marketing";
import { puestoPuedeAcceder } from "../src/lib/modulos-catalogo";

const base = {
  nombre: "Propuesta Meta", objetivo: "clientes_potenciales", canal: "facebook_instagram",
  audiencia: "Personas interesadas en el servicio", contenido: "Agenda una asesoría",
  fechaInicio: "2026-10-21", fechaFin: "2026-10-31",
};
for (const presupuesto of [undefined, null, "", "0", 0]) {
  assert.deepEqual(faltantesRevision({ ...validarCamposCampana("meta_ads", { ...base, presupuesto }), tipo: "meta_ads" }), ["Presupuesto total mayor a $0 MXN"]);
}
for (const presupuesto of ["0.01", "1500.50", "9999999999.99"]) {
  assert.deepEqual(faltantesRevision({ ...validarCamposCampana("meta_ads", { ...base, presupuesto }), tipo: "meta_ads" }), []);
}
assert.throws(() => validarCamposCampana("meta_ads", { ...base, canal: "facebook" }), ErrorMarketing);
assert.throws(() => validarCamposCampana("meta_ads", { ...base, accessToken: "no" }), ErrorMarketing);
for (const puesto of ["Mercadotecnia", "Dirección comercial", "Administrador"]) assert.equal(puestoPuedeAcceder("meta_ads", {}, puesto, "agente"), true);
assert.equal(puestoPuedeAcceder("meta_ads", {}, "Agente", "agente"), false);
const servicio = await readFile(new URL("../src/lib/marketing-db.ts", import.meta.url), "utf8");
assert.doesNotMatch(servicio, /fetch\s*\(|graph\.facebook|access_token|ad_account/i, "la planificación no llama a Meta ni persiste credenciales");
for (const modulo of ["marketing", "meta-ads"]) {
  for (const ruta of ["route.ts", "[id]/route.ts"]) {
    const codigo = await readFile(new URL(`../src/app/api/${modulo}/campanas/${ruta}`, import.meta.url), "utf8");
    assert.match(codigo, /conModulo\(/);
    assert.doesNotMatch(codigo, /export (const|function) DELETE/);
  }
}
console.log("Meta Ads: presupuesto para revisión, canal, acceso por puesto, sin llamadas Meta/credenciales ni endpoint DELETE OK");
