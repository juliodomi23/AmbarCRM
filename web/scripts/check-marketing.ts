import assert from "node:assert/strict";
import {
  ErrorMarketing, estadoTrasAccion, faltantesRevision, validarCambioCampana,
  validarCamposCampana, validarFiltrosCampanas, type AccionCampana, type EstadoCampana,
} from "../src/lib/marketing";
import { puestoPuedeAcceder } from "../src/lib/modulos-catalogo";

const base = { nombre: "Campaña otoño", objetivo: "mensajes", canal: "whatsapp" };
const borrador = validarCamposCampana("marketing", base);
assert.equal(borrador.audiencia, "");
assert.equal(borrador.presupuesto, null);
assert.deepEqual(faltantesRevision({ ...borrador, tipo: "marketing" }), ["Público objetivo", "Contenido", "Fecha de inicio", "Fecha de fin"]);
const completa = validarCamposCampana("marketing", {
  ...base, audiencia: "Clientes actuales", contenido: "Conoce nuestros nuevos servicios",
  fechaInicio: "2026-10-21", fechaFin: "2026-10-31", presupuesto: "1234.50",
});
assert.equal(completa.presupuesto, "1234.50");
assert.deepEqual(faltantesRevision({ ...completa, tipo: "marketing" }), []);
assert.deepEqual(faltantesRevision({ ...completa, presupuesto: null, tipo: "marketing" }), []);
for (const datos of [null, [], "campaña", { ...base, nombre: " " }, { ...base, nombre: "a".repeat(121) },
  { ...base, audiencia: "a".repeat(2001) }, { ...base, contenido: "a".repeat(10001) },
  { ...base, objetivo: "toString" }, { ...base, canal: "facebook_instagram" }, { ...base, orgId: "2" },
  { ...base, estado: "aprobada" }, { ...base, aprobadaPorId: "1" }, { ...base, adAccountId: "1" },
  { ...base, fechaInicio: "2026-02-30" }, { ...base, fechaInicio: "2026-01-01T00:00:00Z" },
  { ...base, fechaInicio: "2026-12-01", fechaFin: "2026-11-01" },
  { ...base, presupuesto: -1 }, { ...base, presupuesto: "1.001" }, { ...base, presupuesto: Infinity },
  { ...base, presupuesto: "10000000000" }, { ...base, presupuesto: {} },
]) assert.throws(() => validarCamposCampana("marketing", datos), ErrorMarketing);
assert.equal(validarCamposCampana("marketing", { ...base, fechaInicio: "2028-02-29" }).fechaInicio, "2028-02-29");
for (const datos of [{}, { version: 0 }, { version: "1" }, { version: 1.5 }, { version: 2147483647 },
  { version: 1, accion: "publicar" }, { version: 1, accion: "aprobar", contenido: "otro" },
  { version: 1, tipo: "meta_ads" }, { version: 1, estado: "aprobada" },
]) assert.throws(() => validarCambioCampana(datos), ErrorMarketing);
assert.equal(validarCambioCampana({ version: 2, nombre: "Nuevo nombre" }).version, 2);
const permitidas = new Map<string, EstadoCampana>([
  ["borrador/enviar_revision", "en_revision"], ["en_revision/aprobar", "aprobada"],
  ["en_revision/devolver_borrador", "borrador"], ["aprobada/devolver_borrador", "borrador"],
  ["borrador/archivar", "archivada"], ["en_revision/archivar", "archivada"], ["aprobada/archivar", "archivada"],
]);
for (const estado of ["borrador", "en_revision", "aprobada", "archivada"] as EstadoCampana[]) {
  for (const accion of ["enviar_revision", "aprobar", "devolver_borrador", "archivar"] as AccionCampana[]) {
    const esperado = permitidas.get(`${estado}/${accion}`);
    if (esperado) assert.equal(estadoTrasAccion(estado, accion, true), esperado);
    else assert.throws(() => estadoTrasAccion(estado, accion, true), (error: unknown) => error instanceof ErrorMarketing && error.status === 409);
  }
}
for (const accion of ["aprobar", "devolver_borrador"] as AccionCampana[]) {
  assert.throws(() => estadoTrasAccion(accion === "aprobar" ? "en_revision" : "aprobada", accion, false),
    (error: unknown) => error instanceof ErrorMarketing && error.status === 403);
}
for (const puesto of ["Mercadotecnia", "Dirección comercial", "Administrador"]) assert.equal(puestoPuedeAcceder("marketing", {}, puesto, "agente"), true);
assert.equal(puestoPuedeAcceder("marketing", {}, "Agente", "agente"), false);
assert.equal(validarFiltrosCampanas(new URLSearchParams("q=otoño&page=2&estado=borrador")).page, 2);
for (const consulta of ["page=0", "page=-1", "page=1.5", "page=1000001", "estado=publicada", `q=${"a".repeat(121)}`]) {
  assert.throws(() => validarFiltrosCampanas(new URLSearchParams(consulta)), ErrorMarketing);
}
console.log("Marketing: validaciones, fechas reales, dinero, campos protegidos, acciones/versiones, matriz de estados y permisos por puesto OK");
