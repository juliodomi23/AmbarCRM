import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { NextRequest } from "next/server";
const require = createRequire(import.meta.url);
const { db, dbRaw, runWithOrg }: typeof import("../../src/lib/db") = require("../../src/lib/db.ts");
const reservas: typeof import("../../src/lib/reservas/servidor") = require("../../src/lib/reservas/servidor.ts");
const { crearCitaInterna }: typeof import("../../src/lib/citas-servidor") = require("../../src/lib/citas-servidor.ts");
const { calcularHorarios, fechaLocal, instanteLocal, sumarDias, ventanasDelDia }: typeof import("../../src/lib/reservas/horarios") = require("../../src/lib/reservas/horarios.ts");
const { validarHorarioDoctor, validarAjustesReservas, validarServicioReserva }: typeof import("../../src/lib/reservas/validar") = require("../../src/lib/reservas/validar.ts");
const auth = require("next-auth/next");
let sesion: { user: { id: string; orgId: string; rol: string; puesto: string } };
auth.getServerSession = async () => sesion;
const horarios: typeof import("../../src/app/api/reservas/horarios/route") = require("../../src/app/api/reservas/horarios/route.ts");
const excepciones: typeof import("../../src/app/api/reservas/excepciones/route") = require("../../src/app/api/reservas/excepciones/route.ts");
const quitarExcepcion: typeof import("../../src/app/api/reservas/excepciones/[id]/route") = require("../../src/app/api/reservas/excepciones/[id]/route.ts");
const ajustes: typeof import("../../src/app/api/reservas/ajustes/route") = require("../../src/app/api/reservas/ajustes/route.ts");
const editarServicio: typeof import("../../src/app/api/reservas/servicios/[id]/route") = require("../../src/app/api/reservas/servicios/[id]/route.ts");
const publica: typeof import("../../src/app/api/public/reservas/[slug]/route") = require("../../src/app/api/public/reservas/[slug]/route.ts");
const horariosPublicos: typeof import("../../src/app/api/public/reservas/[slug]/horarios/route") = require("../../src/app/api/public/reservas/[slug]/horarios/route.ts");

const url = new URL(process.env.DATABASE_URL!);
assert.equal(url.port, "55450");
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
const marca = Date.now();
const org = await dbRaw.org.create({ data: { nombre: "Revisión integral", slug: `integral-${marca}` } });
const cfg = reservas.configReservas({ anticipacionMin: 0, granularidadMin: 5 });
const fecha = sumarDias(fechaLocal(new Date(), cfg.zona), 2);
let grupos = 0;
const pasa = (texto: string) => console.log(`OK ${++grupos} · ${texto}`);
const req = (body: unknown, method = "POST") => new NextRequest("http://localhost/api/reservas", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
async function espera(respuesta: Promise<Response | undefined>, status: number) {
  const res = await respuesta; assert.ok(res);
  const body = await res.json(); assert.equal(res.status, status, JSON.stringify(body)); return body;
}
try {
  const fixture = await runWithOrg(org.id, async () => {
    const usuario = await db.usuario.create({ data: { nombre: "Recepción", email: `integral-${marca}@local.test`, passwordHash: "fixture", rol: "admin" } });
    await db.moduloOrg.createMany({ data: [{ clave: "citas", activo: true }, { clave: "reservas_en_linea", activo: true, config: cfg }] });
    const contacto = await db.contacto.create({ data: { nombre: "Cliente nuevo sin expediente" } });
    const doctor = await db.doctor.create({ data: { nombre: "Especialista" } });
    const servicio = await db.servicioReserva.create({ data: { nombre: "Servicio con margen", duracionMin: 30, bufferMin: 15 } });
    await db.servicioReservaDoctor.create({ data: { doctorId: doctor.id, servicioId: servicio.id } });
    return { usuario, contacto, doctor, servicio };
  });
  const { doctor, servicio, contacto } = fixture;
  sesion = { user: { id: String(fixture.usuario.id), orgId: String(org.id), rol: "admin", puesto: "Administrador" } };
  const altaHorario = (body: object) => runWithOrg(org.id, () => horarios.POST(req(body)));
  const altaExcepcion = (body: object) => runWithOrg(org.id, () => excepciones.POST(req(body)));
  const eliminarExcepcion = (id: string) => runWithOrg(org.id, () => quitarExcepcion.DELETE(new NextRequest("http://localhost/api/reservas", { method: "DELETE" }), { params: Promise.resolve({ id }) }));
  const datosHorario = { doctorId: String(doctor.id), diaSemana: new Date(`${fecha}T12:00:00Z`).getUTCDay(), inicio: "09:00", fin: "18:00" };
  const simultaneos = await Promise.all([altaHorario(datosHorario), altaHorario(datosHorario)]);
  assert.deepEqual(simultaneos.map((r) => r!.status).sort(), [201, 409]);
  pasa("dos horarios semanales simultáneos: uno se guarda y el otro responde 409");

  const especial = { doctorId: String(doctor.id), fecha, inicio: "10:00", fin: "12:00" };
  const creada = await espera(altaExcepcion(especial), 201);
  await espera(altaExcepcion({ ...especial, inicio: "11:00", fin: "13:00" }), 409);
  await espera(altaExcepcion({ doctorId: String(doctor.id), fecha }), 409);
  const tarde = await espera(altaExcepcion({ ...especial, inicio: "14:00", fin: "18:00" }), 201);
  await espera(eliminarExcepcion(creada.excepcion.id), 200); await espera(eliminarExcepcion(tarde.excepcion.id), 200);
  const cierres = await Promise.all([altaExcepcion({ doctorId: String(doctor.id), fecha }), altaExcepcion(especial)]);
  assert.deepEqual(cierres.map((r) => r!.status).sort(), [201, 409]);
  await runWithOrg(org.id, () => db.excepcionHorario.deleteMany({ where: { doctorId: doctor.id } }));
  assert.deepEqual(ventanasDelDia([{ inicioMin: 540, finMin: 1080 }], [{ inicioMin: 600, finMin: 720 }, { inicioMin: null, finMin: null }]), []);
  pasa("excepciones sin superposición ni cierre contradictorio, también simultáneas; cierre legado tiene prioridad");

  const inicio = instanteLocal(fecha, 600, cfg.zona);
  const reservar = () => reservas.reservarCita(org.id, { servicio, candidatos: [doctor.id], inicio, contactoId: contacto.id, notas: null });
  assert.ok((await runWithOrg(org.id, () => reservas.horariosDeDoctor(cfg, servicio, doctor.id, fecha))).includes(inicio.toISOString()));
  const cierre = await espera(altaExcepcion({ doctorId: String(doctor.id), fecha }), 201);
  assert.equal(await reservar(), null);
  await espera(eliminarExcepcion(cierre.excepcion.id), 200);
  await runWithOrg(org.id, () => db.servicioReservaDoctor.deleteMany({ where: { servicioId: servicio.id } }));
  assert.equal(await reservar(), null);
  await runWithOrg(org.id, () => db.servicioReservaDoctor.create({ data: { servicioId: servicio.id, doctorId: doctor.id } }));
  await runWithOrg(org.id, () => db.servicioReserva.update({ where: { id: servicio.id }, data: { duracionMin: 60 } }));
  assert.equal(await reservar(), null);
  await runWithOrg(org.id, () => db.servicioReserva.update({ where: { id: servicio.id }, data: { duracionMin: 30 } }));
  const reservada = await reservar(); assert.ok(reservada);
  assert.equal(+reservada.fin - +reservada.inicio, 45 * 60_000);
  await runWithOrg(org.id, () => db.cita.update({ where: { id: reservada.id }, data: { estado: "cancelada" } }));
  pasa("confirmar revalida cierres, relación servicio/especialista y duración; reserva válida conserva margen una sola vez");

  const interna = await crearCitaInterna(org.id, { contactoId: contacto.id, conversacionId: null, responsableId: fixture.usuario.id, doctorId: doctor.id, servicioId: servicio.id, titulo: servicio.nombre, notas: null, inicio });
  const bloqueadora = await crearCitaInterna(org.id, { contactoId: contacto.id, conversacionId: null, responsableId: fixture.usuario.id, doctorId: doctor.id, titulo: "Ocupa el margen", notas: null, inicio: instanteLocal(fecha, 990, cfg.zona), fin: instanteLocal(fecha, 1020, cfg.zona) });
  const candidata = { id: interna.id, doctorId: doctor.id, inicio: interna.inicio, fin: interna.fin };
  assert.equal(await reservas.reprogramarCita(org.id, candidata, instanteLocal(fecha, 960, cfg.zona)), null);
  assert.equal(await reservas.reprogramarCita(org.id, candidata, instanteLocal(fecha, 1050, cfg.zona)), null);
  await runWithOrg(org.id, () => db.cita.update({ where: { id: bloqueadora.id }, data: { estado: "cancelada" } }));
  const movida = await reservas.reprogramarCita(org.id, candidata, instanteLocal(fecha, 960, cfg.zona)); assert.ok(movida);
  assert.equal(+movida.fin - +movida.inicio, 30 * 60_000);
  pasa("reprogramar cita interna respeta margen en empalmes y jornada, conservando fin visible de 30 minutos");

  const cambiarServicio = (body: unknown) => runWithOrg(org.id, () => editarServicio.PATCH(req(body, "PATCH"), { params: Promise.resolve({ id: String(servicio.id) }) }));
  await espera(cambiarServicio({ bufferMin: 0 }), 409);
  await espera(cambiarServicio({ duracionMin: 60 }), 409);
  await espera(cambiarServicio({ nombre: "Nombre actualizado", precio: "150" }), 200);
  const sinCambios = await runWithOrg(org.id, () => db.servicioReserva.findFirstOrThrow({ where: { id: servicio.id } }));
  assert.equal(sinCambios.bufferMin, 15); assert.equal(sinCambios.duracionMin, 30); assert.equal(sinCambios.nombre, "Nombre actualizado");
  await espera(cambiarServicio(null), 400);
  pasa("editar catálogo no modifica duración ni margen de citas existentes; nombre y precio siguen editables");

  const negocioPublico = () => publica.GET(new NextRequest(`http://localhost/api/public/reservas/${org.slug}`), { params: Promise.resolve({ slug: org.slug }) });
  assert.equal((await espera(negocioPublico(), 200)).negocio.nombre, org.nombre);
  await runWithOrg(org.id, () => db.ajustes.create({ data: { nombreNegocio: "Clínica del cliente" } }));
  assert.equal((await espera(negocioPublico(), 200)).negocio.nombre, "Clínica del cliente");
  await runWithOrg(org.id, () => db.ajustes.updateMany({ data: { marcaNombre: "Marca de la clínica" } }));
  assert.equal((await espera(negocioPublico(), 200)).negocio.nombre, "Marca de la clínica");
  pasa("página pública usa la marca, nombre del negocio o empresa; no muestra Ámbar Rojo por defecto a otros clientes");
  await espera(publica.POST(req({ servicioId: "9223372036854775808", doctorId: "cualquiera", fecha, horario: inicio.toISOString(), nombre: "Entrada inválida", telefono: "9615551234" }), { params: Promise.resolve({ slug: org.slug }) }), 400);
  await espera(horariosPublicos.GET(new NextRequest(`http://localhost/api/public/reservas/${org.slug}/horarios?servicio=9223372036854775808&fecha=${fecha}`), { params: Promise.resolve({ slug: org.slug }) }), 400);
  pasa("ids de servicio fuera de BIGINT responden 400 en reserva pública y disponibilidad");

  for (const doctorId of ["0", "9223372036854775808", "9".repeat(80)]) {
    assert.ok("error" in validarHorarioDoctor({ ...datosHorario, doctorId }));
    assert.ok("error" in validarServicioReserva({ nombre: "Prueba", duracionMin: 30, doctorIds: doctorId }));
  }
  for (const diaSemana of [null, false, ""]) assert.ok("error" in validarHorarioDoctor({ ...datosHorario, diaSemana }));
  const ajustesBase = { anticipacionMin: "0", ventanaDias: "30", granularidadMin: "5", maxPorTelefono: "3" };
  await espera(runWithOrg(org.id, () => ajustes.PATCH(req({ ...ajustesBase, zona: "Zona/Inventada" }, "PATCH"))), 400);
  await espera(runWithOrg(org.id, () => ajustes.PATCH(req({ ...ajustesBase, zona: "America/Tijuana" }, "PATCH"))), 200);
  assert.equal((await runWithOrg(org.id, () => reservas.configReservasEmpresa())).zona, "America/Tijuana");
  assert.ok("data" in validarAjustesReservas(ajustesBase), "compatibilidad sin campo zona");
  pasa("ids fuera de bigint y días vacíos rechazados; zona válida configurable sin romper clientes anteriores");

  const cfgDst = reservas.configReservas({ zona: "America/Tijuana" });
  assert.equal(reservas.inicioDeFechaHora(cfgDst, "2027-03-14", "02:30"), null);
  const slots = calcularHorarios({ fecha: "2027-03-14", zona: cfgDst.zona, ventanas: [{ inicioMin: 120, finMin: 240 }], ocupados: [], duracionMin: 30, bufferMin: 0, granularidadMin: 30, anticipacionMin: 0, ahora: new Date("2027-03-01T00:00:00Z") });
  const horas = slots.map((s) => new Intl.DateTimeFormat("en-GB", { timeZone: cfgDst.zona, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).format(new Date(s)));
  assert.deepEqual(horas, ["03:00", "03:30"]);
  pasa("cambio de horario en Tijuana: 02:30 inexistente no se acepta ni se ofrecen horas fuera de jornada");

  sesion.user.rol = "agente";
  await espera(altaHorario({ ...datosHorario, inicio: "06:00", fin: "07:00" }), 403);
  pasa("configurar jornadas sigue siendo exclusivo del administrador");
  console.log(`CITAS-INTEGRAL: ${grupos} grupos aprobados con PostgreSQL y RLS`);
} finally { await dbRaw.$disconnect(); }
