import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { NextRequest } from "next/server";
const require = createRequire(import.meta.url);
const { db, dbRaw, runWithOrg }: typeof import("../../src/lib/db") = require("../../src/lib/db.ts");
const { fechaLocal, instanteLocal, sumarDias, diaSemana }: typeof import("../../src/lib/reservas/horarios") = require("../../src/lib/reservas/horarios.ts");
const { configReservas, horariosDeDoctor }: typeof import("../../src/lib/reservas/servidor") = require("../../src/lib/reservas/servidor.ts");
const { finDeCita, duracionCitas }: typeof import("../../src/lib/citas-duracion") = require("../../src/lib/citas-duracion.ts");
const auth = require("next-auth/next");
let sesion: { user: { id: string; orgId: string; rol: string; puesto: string } };
auth.getServerSession = async () => sesion;
const agenda: typeof import("../../src/app/api/citas/route") = require("../../src/app/api/citas/route.ts");
const detalle: typeof import("../../src/app/api/citas/[id]/route") = require("../../src/app/api/citas/[id]/route.ts");
const modulos: typeof import("../../src/app/api/modulos/route") = require("../../src/app/api/modulos/route.ts");
const url = new URL(process.env.DATABASE_URL!);
assert.equal(url.port, "55450"); assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
const zona = "America/Cancun", hoy = fechaLocal(new Date(), zona), fecha = sumarDias(hoy, 2);
const inicio = instanteLocal(fecha, 600, zona), marca = Date.now();
const orgs = await Promise.all(["a", "b"].map((nombre) => dbRaw.org.create({ data: { nombre: `Horarios ${nombre}`, slug: `horarios-${nombre}-${marca}` } })));
const fixture = (orgId: bigint) => runWithOrg(orgId, async () => {
  const usuario = await db.usuario.create({ data: { nombre: "Recepción", email: `horarios-${orgId}@local.test`, passwordHash: "fixture", rol: "admin", puesto: "Administrador" } });
  await db.moduloOrg.createMany({ data: [{ clave: "citas", activo: true, config: { duracionMin: 45 } }, { clave: "reservas_en_linea", activo: true, config: { zona, anticipacionMin: 0 } }] });
  const contacto = await db.contacto.create({ data: { nombre: "Paciente de prueba" } });
  const especialista = await db.doctor.create({ data: { nombre: "Con jornada" } });
  const sinHorario = await db.doctor.create({ data: { nombre: "Sin jornada" } });
  const inactivo = await db.doctor.create({ data: { nombre: "Inactivo", activo: false } });
  await db.horarioDoctor.createMany({ data: [{ doctorId: especialista.id, diaSemana: diaSemana(fecha), inicioMin: 540, finMin: 720 }, { doctorId: especialista.id, diaSemana: diaSemana(fecha), inicioMin: 840, finMin: 1080 }] });
  const servicio = await db.servicioReserva.create({ data: { nombre: "Consulta con margen", duracionMin: 30, bufferMin: 15 } });
  await db.servicioReservaDoctor.create({ data: { servicioId: servicio.id, doctorId: especialista.id } });
  const servicioInactivo = await db.servicioReserva.create({ data: { nombre: "Retirado", duracionMin: 30, activo: false } });
  return { usuario, contacto, especialista, sinHorario, inactivo, servicio, servicioInactivo };
});
const [a, b] = await Promise.all(orgs.map((org) => fixture(org.id)));
const org = orgs[0];
sesion = { user: { id: String(a.usuario.id), orgId: String(org.id), rol: "admin", puesto: "Administrador" } };
const req = (method: string, body?: unknown) => new NextRequest("http://localhost/api/citas", { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const post = (body: object) => runWithOrg(org.id, () => agenda.POST(req("POST", body)));
const patch = (id: string | bigint, body: object) => runWithOrg(org.id, () => detalle.PATCH(req("PATCH", body), { params: Promise.resolve({ id: String(id) }) }));
const borrar = (id: string | bigint) => runWithOrg(org.id, () => detalle.DELETE(req("DELETE"), { params: Promise.resolve({ id: String(id) }) }));
const datos = { titulo: "Consulta", contactoId: String(a.contacto.id), doctorId: String(a.especialista.id), inicio: inicio.toISOString() };
let grupos = 0;
function pasa(texto: string) { console.log(`OK ${++grupos} · ${texto}`); }
async function espera(respuesta: Promise<Response | undefined>, status: number) {
  const res = await respuesta; assert.ok(res);
  const body = await res.json(); assert.equal(res.status, status, JSON.stringify(body)); return body;
}
try {
  const normal = await espera(post(datos), 201);
  assert.equal(+new Date(normal.cita.fin) - +inicio, 45 * 60_000);
  assert.deepEqual(normal.avisos, []);
  await espera(borrar(normal.cita.id), 409);
  await espera(patch(normal.cita.id, { estado: "cancelada" }), 200);
  const solicitud = await runWithOrg(org.id, () => db.solicitudResena.create({ data: { contactoId: a.contacto.id, citaId: BigInt(normal.cita.id), evento: "cita", estado: "reservada" } }));
  await espera(borrar(normal.cita.id), 200);
  await runWithOrg(org.id, async () => { assert.equal((await db.solicitudResena.findUniqueOrThrow({ where: { id: solicitud.id } })).citaId, null); assert.equal(await db.cita.count({ where: { id: BigInt(normal.cita.id) } }), 0); });
  await espera(borrar(normal.cita.id), 404);
  pasa("cancelada se borra, no cancelada 409, repetido 404 y reseña pendiente conservada con SET NULL");

  const clinica = await runWithOrg(org.id, async () => {
    const expediente = await db.expedientePaciente.create({ data: { contactoId: a.contacto.id } });
    const cita = await db.cita.create({ data: { titulo: "Con evolución", contactoId: a.contacto.id, inicio, fin: finDeCita(inicio, 30), estado: "cancelada" } });
    const evolucion = await db.evolucionClinica.create({ data: { expedienteId: expediente.id, citaId: cita.id, contenido: "Historial que debe conservarse" } });
    return { cita, evolucion };
  });
  const bloqueo = await espera(borrar(clinica.cita.id), 409); assert.match(bloqueo.error, /evolución clínica/);
  await runWithOrg(org.id, async () => { assert.equal((await db.evolucionClinica.findUniqueOrThrow({ where: { id: clinica.evolucion.id } })).citaId, clinica.cita.id); });
  const ajena = await runWithOrg(orgs[1].id, () => db.cita.create({ data: { titulo: "Ajena", contactoId: b.contacto.id, estado: "cancelada", inicio, fin: finDeCita(inicio, 30) } }));
  await espera(borrar(ajena.id), 404);
  await runWithOrg(orgs[1].id, async () => { assert.equal(await db.cita.count({ where: { id: ajena.id } }), 1); });
  const relaciones = await dbRaw.$queryRaw<{ tabla: string }[]>`SELECT conrelid::regclass::text AS tabla FROM pg_constraint WHERE contype = 'f' AND confrelid = 'citas'::regclass`;
  assert.deepEqual(relaciones.map((fila) => fila.tabla).sort(), ["evoluciones_clinicas", "solicitudes_resena"]);
  pasa("evolución bloquea sin perder vínculo; id ajeno 404 y aislamiento; esquema confirma ausencia de cobros ligados");

  for (const minutos of [480, 710, 750, 1070]) await espera(post({ ...datos, inicio: instanteLocal(fecha, minutos, zona).toISOString(), fin: finDeCita(instanteLocal(fecha, minutos, zona), 30).toISOString() }), 409);
  const dentro = await espera(post(datos), 201); await espera(patch(dentro.cita.id, { estado: "cancelada" }), 200);
  const cierre = await runWithOrg(org.id, () => db.excepcionHorario.create({ data: { doctorId: a.especialista.id, fecha: new Date(`${fecha}T00:00:00Z`) } }));
  await espera(post(datos), 409);
  await runWithOrg(org.id, () => db.excepcionHorario.update({ where: { id: cierre.id }, data: { inicioMin: 600, finMin: 660 } }));
  const especial = await espera(post(datos), 201); await espera(patch(especial.cita.id, { estado: "cancelada" }), 200);
  await runWithOrg(org.id, () => db.excepcionHorario.delete({ where: { id: cierre.id } }));
  pasa("dentro de jornada OK; fuera, descanso, cruce y cierre 409; excepción con horario especial respetada");

  const libre = await espera(post({ ...datos, doctorId: String(a.sinHorario.id), inicio: instanteLocal(fecha, 60, zona).toISOString() }), 201);
  assert.match(libre.avisos[0], /no tiene horarios definidos/);
  await espera(post({ ...datos, doctorId: null, inicio: instanteLocal(fecha, 60, zona).toISOString() }), 201);
  await espera(post({ ...datos, doctorId: String(a.inactivo.id) }), 400);
  const ayer = instanteLocal(sumarDias(hoy, -1), 600, zona);
  await espera(post({ ...datos, doctorId: null, inicio: ayer.toISOString() }), 400);
  await espera(post({ ...datos, doctorId: null, inicio: instanteLocal(hoy, 0, zona).toISOString() }), 201);
  const historica = await runWithOrg(org.id, () => db.cita.create({ data: { contactoId: a.contacto.id, doctorId: a.especialista.id, titulo: "Histórica", inicio: ayer, fin: finDeCita(ayer, 30) } }));
  await espera(patch(historica.id, { estado: "confirmada", notas: "Corrección histórica" }), 200);
  await espera(patch(libre.cita.id, { inicio: ayer.toISOString() }), 400);
  pasa("sin horarios permitido con aviso; sin especialista permitido; inactivo 400; mismo día local permitido y días anteriores 400; estado/notas históricos editables");

  const conServicio = await espera(post({ ...datos, servicioId: String(a.servicio.id) }), 201);
  assert.equal(+new Date(conServicio.cita.fin) - +inicio, 30 * 60_000); assert.equal(conServicio.cita.servicioId, String(a.servicio.id));
  await espera(post({ ...datos, inicio: finDeCita(inicio, 30).toISOString(), fin: finDeCita(inicio, 40).toISOString() }), 409);
  const libres = await runWithOrg(org.id, () => horariosDeDoctor(configReservas({ zona, anticipacionMin: 0, granularidadMin: 5 }), a.servicio, a.especialista.id, fecha));
  assert.ok(!libres.includes(finDeCita(inicio, 30).toISOString())); assert.ok(libres.includes(finDeCita(inicio, 45).toISOString()));
  await espera(post({ ...datos, servicioId: String(a.servicio.id), doctorId: null, fin: finDeCita(inicio, 45).toISOString() }), 400);
  await espera(post({ ...datos, servicioId: String(a.servicio.id), doctorId: String(a.sinHorario.id) }), 400);
  await espera(post({ ...datos, servicioId: String(b.servicio.id), doctorId: null }), 400);
  await espera(post({ ...datos, servicioId: String(a.servicioInactivo.id), doctorId: null }), 400);
  await espera(patch(conServicio.cita.id, { servicioId: String(b.servicio.id) }), 400);
  await espera(patch(conServicio.cita.id, { inicio: instanteLocal(fecha, 900, zona).toISOString() }), 200);
  await runWithOrg(org.id, async () => { const movida = await db.cita.findUniqueOrThrow({ where: { id: BigInt(conServicio.cita.id) } }); assert.equal(+movida.fin - +movida.inicio, 30 * 60_000); });
  pasa("servicio calcula fin visible sin margen, margen bloquea empalmes y disponibilidad pública; fin inconsistente, servicio ajeno/inactivo o especialista incompatible 400; mover conserva duración");

  const externa = await runWithOrg(org.id, () => db.cita.create({ data: { contactoId: a.contacto.id, doctorId: a.especialista.id, servicioId: a.servicio.id, titulo: "Reserva histórica", origen: "bot", inicio, fin: finDeCita(inicio, 45) } }));
  await espera(patch(externa.id, { inicio: instanteLocal(fecha, 960, zona).toISOString() }), 200);
  await runWithOrg(org.id, async () => { const movida = await db.cita.findUniqueOrThrow({ where: { id: externa.id } }); assert.equal(+movida.fin - +movida.inicio, 45 * 60_000); assert.equal(movida.origen, "bot"); });
  pasa("edición interna de reserva del bot conserva origen y margen exactamente una vez");

  await runWithOrg(org.id, () => db.moduloOrg.updateMany({ where: { clave: "citas" }, data: { config: {} } }));
  const porTreinta = await espera(post({ ...datos, doctorId: null }), 201);
  assert.equal(+new Date(porTreinta.cita.fin) - +inicio, 30 * 60_000);
  const manual = await espera(post({ ...datos, doctorId: null, fin: finDeCita(inicio, 50).toISOString() }), 201);
  await espera(patch(manual.cita.id, { inicio: finDeCita(inicio, 120).toISOString() }), 200);
  await runWithOrg(org.id, async () => { const movida = await db.cita.findUniqueOrThrow({ where: { id: BigInt(manual.cita.id) } }); assert.equal(+movida.fin - +movida.inicio, 50 * 60_000); });
  for (const valor of [4, 481, 30.5, "45", null]) await espera(runWithOrg(org.id, () => modulos.PATCH(req("PATCH", { clave: "citas", config: { duracionMin: valor } }))), 400);
  for (const valor of [5, 480, 45]) await espera(runWithOrg(org.id, () => modulos.PATCH(req("PATCH", { clave: "citas", config: { duracionMin: valor } }))), 200);
  assert.equal(duracionCitas({ duracionMin: 0 }), 30);
  pasa("fallback de 30, duración manual de 50 conservada al mover y configuración validada entre 5 y 480");
  await runWithOrg(org.id, () => db.moduloOrg.updateMany({ where: { clave: "citas" }, data: { config: { puestosPermitidos: ["Recepcionista"] } } }));
  sesion.user.rol = "agente"; sesion.user.puesto = "Cajero";
  await espera(borrar(ajena.id), 403);
  pasa("DELETE conserva permisos del módulo");
  console.log(`CITAS-HORARIOS: ${grupos} grupos aprobados con PostgreSQL y RLS`);
} finally { await dbRaw.$disconnect(); }
