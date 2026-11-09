import assert from "node:assert/strict";
import { db, dbRaw, runWithOrg } from "../src/lib/db";
import { moduloPorClave } from "../src/lib/modulos-catalogo";
import { requireModuloActivo } from "../src/lib/modulos";
import {
  debeVolverARevision,
  esRevisorDe,
  piezasDeLaSemana,
  puedeAprobar,
  puedeEditarPieza,
  semanaDe,
  transicionContenidoValida,
  validarEnlaceMaterial,
} from "../src/lib/contenido";

assert.equal(transicionContenidoValida("idea", "redaccion"), true, "idea pasa a redacción");
assert.equal(transicionContenidoValida("idea", "aprobado"), false, "idea no salta a aprobado");
assert.equal(transicionContenidoValida("revision", "cambios"), true, "revisión puede pedir cambios");
assert.equal(transicionContenidoValida("cambios", "revision"), true, "cambios regresa a revisión");
assert.equal(transicionContenidoValida("publicado", "revision"), false, "publicado es final");
assert.equal(transicionContenidoValida("aprobado", "programado"), true, "aprobado se programa");
assert.equal(puedeAprobar({ redactorId: 1n, revisorId: 2n }, 2n, "Mercadotecnia", "agente"), true, "el revisor asignado aprueba");
assert.equal(puedeAprobar({ redactorId: 2n, revisorId: 2n }, 2n, "Mercadotecnia", "agente"), false, "el redactor no aprueba su propia pieza");
assert.equal(puedeAprobar({ redactorId: 1n, revisorId: 2n }, 3n, "Dirección comercial", "agente"), true, "Dirección comercial aprueba");
assert.equal(esRevisorDe({ revisorId: 2n }, 2n), true);
assert.equal(puedeEditarPieza({ redactorId: 1n, revisorId: 2n }, 1n, "Mercadotecnia", "agente"), true, "el redactor edita su pieza");
assert.equal(puedeEditarPieza({ redactorId: 1n, revisorId: 2n }, 3n, "Mercadotecnia", "agente"), false, "otro mercadólogo no edita la pieza");
assert.equal(debeVolverARevision("aprobado", "texto", "texto nuevo"), true, "editar copy aprobado regresa a revisión");
assert.equal(debeVolverARevision("aprobado", "texto", "texto"), false, "guardar sin cambios conserva el estado");
assert.deepEqual(semanaDe("2026-11-09"), { inicio: "2026-11-09", fin: "2026-11-15" }, "la semana va de lunes a domingo");
assert.equal(piezasDeLaSemana([{ fechaPublicacion: "2026-11-10T15:00:00Z" }, { fechaPublicacion: "2026-11-17T15:00:00Z" }, { fechaPublicacion: null }], "2026-11-09").length, 1, "solo incluye piezas de la semana");
assert.equal(validarEnlaceMaterial("https://example.com/a"), true, "acepta https");
assert.equal(validarEnlaceMaterial("http://example.com/a"), false, "rechaza http");
assert.equal(validarEnlaceMaterial(""), true, "el enlace vacío es válido");

async function comprobarBase() {
  if (process.env.CHECK_DB !== "1") {
    console.log("contenido: pruebas de base omitidas (define CHECK_DB=1 para ejecutarlas)");
    return;
  }
  const orgA = 95n, orgB = 96n;
  const existentes = await dbRaw.org.findMany({ where: { id: { in: [orgA, orgB] } } });
  if (existentes.length) throw new Error("La base de prueba de contenido debe estar vacía");
  await dbRaw.org.createMany({ data: [{ id: orgA, nombre: "Contenido A", slug: `contenido-a-${Date.now()}` }, { id: orgB, nombre: "Contenido B", slug: `contenido-b-${Date.now()}` }] });
  try {
    await runWithOrg(orgA, () => db.moduloOrg.create({ data: { clave: "contenido", activo: true } }));
    assert.equal(moduloPorClave("contenido")?.soloOrgId, undefined, "Contenido es activable por cualquier organización");
    assert.equal(await runWithOrg(orgA, () => requireModuloActivo("contenido", { rol: "admin" })), null);
    assert.equal((await runWithOrg(orgB, () => requireModuloActivo("contenido", { rol: "admin" })))?.status, 404, "sin módulo la API responde 404");

    const usuario = await runWithOrg(orgA, () => db.usuario.create({ data: { nombre: "Editor", email: `editor-${Date.now()}@example.test`, passwordHash: "x", rol: "agente", puesto: "Mercadotecnia" } }));
    const pieza = await runWithOrg(orgA, () => db.contenidoPieza.create({ data: { titulo: "Pieza demo", canal: "instagram", formato: "imagen", copy: "Hola", redactorId: usuario.id, revisorId: usuario.id } }));
    assert.equal(await runWithOrg(orgB, () => db.contenidoPieza.count()), 0, "RLS oculta piezas de otra org");
    const actualizada = await runWithOrg(orgA, () => db.contenidoPieza.update({ where: { id: pieza.id }, data: { estado: "revision", version: { increment: 1 } } }));
    assert.equal(actualizada.estado, "revision");
    const vieja = await runWithOrg(orgA, () => db.contenidoPieza.updateMany({ where: { id: pieza.id, version: 1 }, data: { titulo: "Cambio viejo" } }));
    assert.equal(vieja.count, 0, "una versión anterior no puede editar la pieza");
    await runWithOrg(orgA, () => db.contenidoComentario.create({ data: { piezaId: pieza.id, usuarioId: usuario.id, texto: "Revisar", tipo: "comentario" } }));
    assert.equal(await runWithOrg(orgA, () => db.contenidoComentario.count()), 1, "los comentarios quedan ligados a la pieza");
    console.log("contenido: reglas puras y base OK");
  } finally {
    for (const org of [orgA, orgB]) {
      await runWithOrg(org, async () => {
        await db.contenidoCambio.deleteMany({});
        await db.contenidoComentario.deleteMany({});
        await db.contenidoPieza.deleteMany({});
        await db.contacto.deleteMany({});
        await db.usuario.deleteMany({});
        await db.moduloOrg.deleteMany({});
      });
    }
    await dbRaw.org.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  }
}

await comprobarBase();
