import assert from "node:assert/strict";
import pg from "pg";
import type { ProveedorCalendario } from "../../src/lib/calendario/tipos";

function validarUrl(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Define ${name} para PostgreSQL aislado`);
  const url = new URL(value);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/cfdi_test") throw new Error("La prueba solo admite localhost/cfdi_test");
  return value;
}
const appUrl = validarUrl("DATABASE_URL");
const adminUrl = validarUrl("ADMIN_DATABASE_URL");
Reflect.set(process.env, "NODE_ENV", "test");
process.env.CALENDARIO_PERMITIR_MOCK = "1";
process.env.PAGOS_TOKEN_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");

const { db, dbRaw, runWithOrg } = await import("../../src/lib/db");
const { cifrarCredencialPago } = await import("../../src/lib/pagos/credenciales");
const { pushCitaCalendario, sincronizarCalendario } = await import("../../src/lib/calendario/servicio");
const { proveedorCalendarioMock } = await import("../../src/lib/calendario/mock");
const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
const orgA = 95n; const orgB = 96n; const orgIds = ["95", "96"];

async function limpiar() {
  await admin.query("DELETE FROM eventos_calendario WHERE org_id = ANY($1::bigint[])", [orgIds]);
  await admin.query("DELETE FROM calendarios_conectados WHERE org_id = ANY($1::bigint[])", [orgIds]);
  await admin.query("DELETE FROM citas WHERE org_id = ANY($1::bigint[])", [orgIds]);
  await admin.query("DELETE FROM contactos WHERE org_id = ANY($1::bigint[])", [orgIds]);
  await admin.query("DELETE FROM modulos_org WHERE org_id = ANY($1::bigint[])", [orgIds]);
  await admin.query("DELETE FROM usuarios WHERE org_id = ANY($1::bigint[])", [orgIds]);
  await admin.query("DELETE FROM orgs WHERE id = ANY($1::bigint[])", [orgIds]);
}

try {
  assert.equal(appUrl, process.env.DATABASE_URL);
  await limpiar();
  await admin.query("INSERT INTO orgs(id,nombre,slug) VALUES (95,'Calendar A','calendar-a'),(96,'Calendar B','calendar-b')");
  await admin.query("INSERT INTO usuarios(id,org_id,nombre,email,password_hash,rol) OVERRIDING SYSTEM VALUE VALUES (9501,95,'Doctor A','doctor-a@test.invalid','test','agente'),(9502,95,'Doctor B','doctor-b@test.invalid','test','agente')");
  const { contacto, cita } = await runWithOrg(orgA, async () => {
    await db.moduloOrg.create({ data: { clave: "calendario", activo: true } });
    const contacto = await db.contacto.create({ data: { nombre: "Contacto de prueba" } });
    for (const usuarioCrmId of [9501n, 9502n]) await db.calendarioConectado.create({ data: { usuarioCrmId, proveedor: "mock", cuentaGoogle: `mock-${usuarioCrmId}@example.test`, calendarId: "primary", accessTokenEncrypted: cifrarCredencialPago("test-access"), refreshTokenEncrypted: cifrarCredencialPago("test-refresh"), timezone: "America/Mexico_City" } });
    const cita = await db.cita.create({ data: { contactoId: contacto.id, responsableId: 9501n, titulo: "Cita inicial", inicio: new Date("2026-11-01T16:00:00Z"), fin: new Date("2026-11-01T16:30:00Z") } });
    return { contacto, cita };
  });
  const citaB = await runWithOrg(orgA, () => db.cita.create({ data: { contactoId: contacto.id, responsableId: 9502n, titulo: "Cita B", inicio: new Date("2026-11-01T17:00:00Z"), fin: new Date("2026-11-01T17:30:00Z") } }));
  const citaSinResponsable = await runWithOrg(orgA, () => db.cita.create({ data: { contactoId: contacto.id, titulo: "Sin responsable", inicio: new Date("2026-11-01T18:00:00Z"), fin: new Date("2026-11-01T18:30:00Z") } }));
  assert.equal(await runWithOrg(orgA, () => db.calendarioConectado.count({ where: { calendarId: "primary" } })), 2, "dos usuarios pueden conectar primary en la misma organización");
  let lecturas = 0;
  const proveedorParcial = {
    listarCambios: async () => { lecturas++; if (lecturas === 1) throw new Error("Fallo simulado"); return { items: [], nextSyncToken: "token-nuevo" }; },
    obtenerEvento: async () => null,
    guardarEvento: async () => { throw new Error("No esperado"); },
    eliminarEvento: async () => undefined,
    marcarCita: async () => undefined,
  } as ProveedorCalendario;
  const resultadoParcial = await runWithOrg(orgA, () => sincronizarCalendario(orgA, undefined, proveedorParcial));
  assert.equal(resultadoParcial.conexiones.filter((item) => "error" in item).length, 1, "una conexión fallida no detiene a la otra");
  const fallidaId = resultadoParcial.conexiones.find((item) => "error" in item)?.conexionId;
  const usuarioFallido = String((await runWithOrg(orgA, () => db.calendarioConectado.findFirstOrThrow({ where: { usuarioCrmId: 9501n } }))).id) === fallidaId ? 9501n : 9502n;
  assert.equal((await runWithOrg(orgA, () => db.calendarioConectado.findFirstOrThrow({ where: { usuarioCrmId: usuarioFallido } }))).ultimoError, "Falló la sincronización con Google Calendar", "el error se guarda en la conexión que falló");
  await runWithOrg(orgA, () => pushCitaCalendario(cita.id));
  await runWithOrg(orgA, () => pushCitaCalendario(citaB.id));
  await runWithOrg(orgA, () => pushCitaCalendario(citaSinResponsable.id));
  await runWithOrg(orgA, () => pushCitaCalendario(cita.id));
  let mappings = await runWithOrg(orgA, () => db.eventoCalendario.findMany({ where: { citaId: cita.id } }));
  assert.equal(mappings.length, 1, "push idempotente no duplica el mapeo");
  assert.equal(await runWithOrg(orgA, () => db.eventoCalendario.count({ where: { citaId: citaB.id } })), 1, "la cita B solo se mapea a su conexión");
  assert.equal(await runWithOrg(orgA, () => db.eventoCalendario.count({ where: { citaId: citaSinResponsable.id } })), 0, "citas sin responsable no se envían");
  const privateId = String(cita.id);
  const guardado = await proveedorCalendarioMock.obtenerEvento(mappings[0].eventoExterno);
  assert.equal(guardado?.extendedProperties?.private?.ambarcrm_cita_id, privateId);

  await runWithOrg(orgA, () => db.cita.update({ where: { id: cita.id }, data: { titulo: "Actualizada en CRM" } }));
  await runWithOrg(orgA, () => pushCitaCalendario(cita.id));
  assert.equal((await proveedorCalendarioMock.obtenerEvento(mappings[0].eventoExterno))?.summary, "Actualizada en CRM");
  await runWithOrg(orgA, () => db.cita.update({ where: { id: cita.id }, data: { estado: "cancelada" } }));
  await runWithOrg(orgA, () => pushCitaCalendario(cita.id));
  assert.equal((await runWithOrg(orgA, () => db.eventoCalendario.findFirst({ where: { citaId: cita.id } })))?.estado, "eliminado");

  const externo = await proveedorCalendarioMock.guardarEvento(null, { summary: "Evento externo", start: { dateTime: "2026-11-02T16:00:00Z" }, end: { dateTime: "2026-11-02T17:00:00Z" } });
  await runWithOrg(orgA, () => sincronizarCalendario(orgA));
  const importado = await runWithOrg(orgA, () => db.eventoCalendario.findFirst({ where: { eventoExterno: externo.id }, include: { cita: true } }));
  assert.equal(importado?.cita?.origen, "calendar");
  assert.ok(importado?.citaId);
  await runWithOrg(orgA, () => sincronizarCalendario(orgA));
  await new Promise((resolve) => setTimeout(resolve, 5));
  await runWithOrg(orgA, () => db.cita.update({ where: { id: importado!.citaId! }, data: { titulo: "Cambio CRM concurrente" } }));
  const eventoAnterior = await proveedorCalendarioMock.obtenerEvento(externo.id);
  assert.ok(eventoAnterior?.start?.dateTime && eventoAnterior.end?.dateTime);
  await proveedorCalendarioMock.guardarEvento(externo.id, { summary: "Cambio Calendar concurrente", description: eventoAnterior.description, start: eventoAnterior.start, end: eventoAnterior.end, extendedProperties: eventoAnterior.extendedProperties });
  await runWithOrg(orgA, () => sincronizarCalendario(orgA));
  const conflicto = await runWithOrg(orgA, () => db.eventoCalendario.findFirstOrThrow({ where: { eventoExterno: externo.id }, include: { cita: true } }));
  assert.equal(conflicto.estado, "conflicto");
  assert.match(conflicto.detalle ?? "", /Conflicto CRM/u);
  assert.equal(conflicto.cita?.titulo, "Cambio Calendar concurrente");
  await runWithOrg(orgA, () => sincronizarCalendario(orgA));
  const mapeosExterno = await runWithOrg(orgA, () => db.eventoCalendario.findMany({ where: { eventoExterno: externo.id }, select: { calendarioId: true } }));
  assert.equal(new Set(mapeosExterno.map((mapeo) => String(mapeo.calendarioId))).size, mapeosExterno.length, "pull no duplica mapeos dentro de una misma conexión");

  const { conexion } = await runWithOrg(orgA, async () => ({ conexion: await db.calendarioConectado.findFirstOrThrow({ where: { usuarioCrmId: 9501n } }) }));
  const cifrado = await admin.query("SELECT access_token_encrypted, refresh_token_encrypted FROM calendarios_conectados WHERE id=$1", [String(conexion.id)]);
  assert.match(cifrado.rows[0].access_token_encrypted, /^encv1:/);
  assert.match(cifrado.rows[0].refresh_token_encrypted, /^encv1:/);
  assert.equal(await runWithOrg(orgB, () => db.calendarioConectado.count()), 0, "RLS oculta la conexión de A a B");
  assert.equal(await runWithOrg(orgB, () => db.eventoCalendario.count()), 0, "RLS oculta eventos de A a B");
  assert.equal(await runWithOrg(orgB, () => db.cita.count()), 0, "RLS oculta las citas importadas de A a B");
  await runWithOrg(orgA, () => db.calendarioConectado.updateMany({ where: { usuarioCrmId: 9501n }, data: { estado: "revocada" } }));
  assert.equal((await runWithOrg(orgA, () => db.calendarioConectado.findFirstOrThrow({ where: { usuarioCrmId: 9502n } }))).estado, "activa", "desconectar A no afecta B");
  await limpiar();
  console.log("test-calendario-e2e OK");
} finally {
  await dbRaw.$disconnect();
  await admin.end();
}
