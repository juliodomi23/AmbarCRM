import assert from "node:assert/strict";
import pg from "pg";
import { dbRaw } from "../../src/lib/db";
import { transaccionTenant } from "../../src/lib/retail-db";
import { ErrorMarketing, validarFiltrosCampanas } from "../../src/lib/marketing";
import { cambiarCampana, crearCampana, listarCampanas, obtenerCampana } from "../../src/lib/marketing-db";
import type { SesionModulo } from "../../src/lib/con-modulo";

const appUrl = process.env.DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
for (const valor of [appUrl, adminUrl]) {
  if (!valor || !["127.0.0.1", "localhost", "[::1]"].includes(new URL(valor).hostname)) {
    throw new Error("Esta prueba requiere DATABASE_URL y ADMIN_DATABASE_URL explícitas de una base local desechable.");
  }
}
const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
const app = new pg.Pool({ connectionString: appUrl, max: 1 });
const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const orgA = BigInt(Date.now()) * 1000n + 777n;
const orgB = orgA + 1n;
const base = {
  nombre: "Marketing prueba", objetivo: "mensajes", canal: "whatsapp",
  audiencia: "Clientes actuales", contenido: "Conoce nuestro servicio",
  fechaInicio: "2026-10-21", fechaFin: "2026-10-31", presupuesto: "2500.50",
};
const filtro = (consulta = "") => validarFiltrosCampanas(new URLSearchParams(consulta));
const falla = (status: number) => (error: unknown) => error instanceof ErrorMarketing && error.status === status;

async function main() {
  const rol = await app.query("SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user");
  assert.equal(rol.rows[0].rolsuper, false);
  assert.equal(rol.rows[0].rolbypassrls, false);
  await admin.query("INSERT INTO orgs(id,nombre,slug) VALUES ($1,'Marketing A',$2),($3,'Marketing B',$4)", [String(orgA), `marketing-a-${sufijo}`, String(orgB), `marketing-b-${sufijo}`]);
  const usuarioA = await transaccionTenant(orgA, tx => tx.usuario.create({ data: { nombre: "Admin marketing", email: `marketing-a-${sufijo}@test.local`, passwordHash: "no-login", rol: "admin", puesto: "Administrador" } }));
  const usuarioB = await transaccionTenant(orgB, tx => tx.usuario.create({ data: { nombre: "Otro admin", email: `marketing-b-${sufijo}@test.local`, passwordHash: "no-login", rol: "admin", puesto: "Administrador" } }));
  const actor: SesionModulo = { orgId: orgA, userId: usuarioA.id, rol: "admin", puesto: "Administrador" };
  const ajeno: SesionModulo = { orgId: orgB, userId: usuarioB.id, rol: "admin", puesto: "Administrador" };
  const agente: SesionModulo = { ...actor, rol: "agente", puesto: "Mercadotecnia" };
  await assert.rejects(() => crearCampana({ ...actor, orgId: null }, "marketing", base), falla(401));
  await assert.rejects(() => crearCampana(actor, "marketing", { ...base, estado: "aprobada" }), falla(400));
  const campana = await crearCampana(actor, "marketing", base);
  assert.equal(campana.estado, "borrador");
  assert.equal(campana.version, 1);
  assert.equal(campana.presupuesto, "2500.50");
  assert.equal(campana.fechaInicio, "2026-10-21");
  assert.equal(typeof campana.id, "string");
  const id = BigInt(campana.id);
  const almacenada = await transaccionTenant(orgA, tx => tx.campanaMarketing.findFirstOrThrow({ where: { id } }));
  assert.equal(almacenada.orgId, orgA, "DEFAULT org_id toma el contexto tenant");
  assert.equal((await app.query("SELECT id FROM campanas_marketing WHERE id=$1", [campana.id])).rowCount, 0, "sin tenant no se pueden leer campañas");
  assert.equal((await listarCampanas(ajeno, "marketing", filtro())).total, 0);
  assert.equal((await transaccionTenant(orgB, tx => tx.campanaMarketing.findMany({ where: { id } }))).length, 0, "RLS filtra sin condición org_id en el servicio");
  assert.equal((await transaccionTenant(orgB, tx => tx.campanaMarketing.updateMany({ where: { id }, data: { nombre: "No permitido" } }))).count, 0);
  await assert.rejects(() => obtenerCampana(ajeno, "marketing", id), falla(404));
  await assert.rejects(() => cambiarCampana(ajeno, "marketing", id, { version: 1, nombre: "No permitido" }), falla(404));
  await assert.rejects(() => obtenerCampana(actor, "meta_ads", id), falla(404));
  await assert.rejects(() => cambiarCampana(actor, "marketing", id, { version: 1, orgId: String(orgB) }), falla(400));

  const carreras = await Promise.allSettled([
    cambiarCampana(actor, "marketing", id, { version: 1, nombre: "Nombre A" }),
    cambiarCampana(actor, "marketing", id, { version: 1, nombre: "Nombre B" }),
  ]);
  assert.equal(carreras.filter(r => r.status === "fulfilled").length, 1, "solo una escritura gana la comparación de versión");
  const perdida = carreras.find(r => r.status === "rejected");
  assert.ok(perdida && perdida.status === "rejected" && falla(409)(perdida.reason));
  const editada = await obtenerCampana(actor, "marketing", id);
  assert.equal(editada.version, 2);
  await assert.rejects(() => cambiarCampana(actor, "marketing", id, { version: 1, accion: "enviar_revision" }), falla(409));
  const revision = await cambiarCampana(agente, "marketing", id, { version: 2, accion: "enviar_revision" });
  assert.equal(revision.estado, "en_revision");
  await assert.rejects(() => cambiarCampana(agente, "marketing", id, { version: revision.version, accion: "aprobar" }), falla(403));
  await assert.rejects(() => cambiarCampana(actor, "marketing", id, { version: revision.version, contenido: "Contenido cambiado sin revisión" }), falla(409));
  const aprobada = await cambiarCampana(actor, "marketing", id, { version: revision.version, accion: "aprobar" });
  assert.equal(aprobada.aprobadaPorId, String(usuarioA.id));
  assert.ok(aprobada.aprobadaAt);
  await assert.rejects(() => cambiarCampana(agente, "marketing", id, { version: aprobada.version, accion: "devolver_borrador" }), falla(403));
  const reabierta = await cambiarCampana(actor, "marketing", id, { version: aprobada.version, accion: "devolver_borrador" });
  assert.equal(reabierta.aprobadaAt, null);
  assert.equal(reabierta.aprobadaPorId, null);
  const corregida = await cambiarCampana(actor, "marketing", id, { version: reabierta.version, contenido: "Nueva versión del contenido" });
  const revisionNueva = await cambiarCampana(actor, "marketing", id, { version: corregida.version, accion: "enviar_revision" });
  await assert.rejects(() => cambiarCampana(actor, "marketing", id, { version: revision.version, accion: "aprobar" }), falla(409), "una aprobación antigua no puede aprobar contenido distinto");
  const accionesConcurrentes = await Promise.allSettled([
    cambiarCampana(actor, "marketing", id, { version: revisionNueva.version, accion: "aprobar" }),
    cambiarCampana(actor, "marketing", id, { version: revisionNueva.version, accion: "devolver_borrador" }),
  ]);
  assert.equal(accionesConcurrentes.filter(r => r.status === "fulfilled").length, 1, "aprobación y devolución concurrentes no se pisan");
  const actual = await obtenerCampana(actor, "marketing", id);
  const archivada = await cambiarCampana(actor, "marketing", id, { version: actual.version, accion: "archivar" });
  assert.equal(archivada.estado, "archivada");
  await assert.rejects(() => cambiarCampana(actor, "marketing", id, { version: archivada.version, nombre: "Editar archivo" }), falla(409));
  await assert.rejects(() => app.query("DELETE FROM campanas_marketing WHERE id=$1", [campana.id]), (error: { code?: string }) => error.code === "42501");

  const meta = await crearCampana(actor, "meta_ads", { ...base, nombre: "Propuesta Meta", canal: "facebook_instagram", presupuesto: null });
  await assert.rejects(() => cambiarCampana(actor, "meta_ads", BigInt(meta.id), { version: meta.version, accion: "enviar_revision" }), falla(400));
  const metaCompleta = await cambiarCampana(actor, "meta_ads", BigInt(meta.id), { version: meta.version, presupuesto: "800.01" });
  const metaRevision = await cambiarCampana(actor, "meta_ads", BigInt(meta.id), { version: metaCompleta.version, accion: "enviar_revision" });
  assert.equal(metaRevision.estado, "en_revision");
  const incompleta = await crearCampana(actor, "marketing", { nombre: "Idea", objetivo: "ventas", canal: "otro" });
  await assert.rejects(() => cambiarCampana(actor, "marketing", BigInt(incompleta.id), { version: 1, accion: "enviar_revision" }), falla(400));
  for (let indice = 0; indice < 26; indice++) await crearCampana(actor, "marketing", { ...base, nombre: `Paginada ${indice}` });
  const primera = await listarCampanas(actor, "marketing", filtro("q=Paginada"));
  const segunda = await listarCampanas(actor, "marketing", filtro("q=Paginada&page=2"));
  assert.equal(primera.total, 26);
  assert.equal(primera.campanas.length, 24);
  assert.equal(segunda.campanas.length, 2);
  assert.equal(primera.resumen.borrador, 26, "el resumen cuenta todas las filas, no solo la página");
  assert.equal(new Set([...primera.campanas, ...segunda.campanas].map(c => c.id)).size, 26);
  const archivos = await listarCampanas(actor, "marketing", filtro("estado=archivada"));
  assert.equal(archivos.total, 1);
  assert.equal(archivos.resumen.borrador, 27, "filtro de estado no altera los demás contadores");
  assert.equal((await listarCampanas(actor, "meta_ads", filtro())).total, 1, "las propuestas Meta no se mezclan con Marketing");
  const control = await crearCampana(actor, "marketing", { ...base, nombre: "Control negativo CAS" });
  const sinProteccion = await Promise.all(["Control A", "Control B"].map(nombre =>
    transaccionTenant(orgA, tx => tx.campanaMarketing.updateMany({
      where: { id: BigInt(control.id) },
      data: { nombre, version: { increment: 1 } },
    })),
  ));
  assert.equal(sinProteccion.filter(resultado => resultado.count === 1).length, 2,
    "control negativo: quitar el predicado de versión permite ambas escrituras sobre la misma versión leída");
  assert.equal((await obtenerCampana(actor, "marketing", BigInt(control.id))).version, 3);
  console.log("Control negativo CAS: sin predicado de versión 2 escrituras exitosas; servicio protegido 1 éxito y 1 conflicto");
  console.log("Marketing DB: persistencia, DTO, RLS sin contexto/otro tenant, módulos separados, permiso admin, aprobación/versionado, carreras de edición/estado, archivo sin DELETE, validación Meta y paginación/resumen OK");
}

try { await main(); }
finally {
  await admin.query("DELETE FROM campanas_marketing WHERE org_id IN ($1,$2)", [String(orgA), String(orgB)]);
  await admin.query("DELETE FROM usuarios WHERE org_id IN ($1,$2)", [String(orgA), String(orgB)]);
  await admin.query("DELETE FROM orgs WHERE id IN ($1,$2)", [String(orgA), String(orgB)]);
  await Promise.all([admin.end(), app.end(), dbRaw.$disconnect()]);
}
