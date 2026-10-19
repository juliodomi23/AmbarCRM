import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { db, dbRaw, runWithOrg } from "../../src/lib/db";
import { fechaLocal, instanteLocal, sumarDias } from "../../src/lib/reservas/horarios";

const base = process.env.E2E_BASE_URL!;
assert.equal(new URL(process.env.DATABASE_URL!).port, "55450");
assert.equal(new URL(base).port, "3118");
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const marca = Date.now();
const zona = "America/Tijuana";
const fecha = sumarDias(fechaLocal(new Date(), zona), 2);
const iso = (min: number) => instanteLocal(fecha, min, zona).toISOString();
const cookieDe = (res: Response) => res.headers.getSetCookie().map((c) => c.split(";", 1)[0]).join("; ");
const password = "Autoservicio-local-2026";
let grupos = 0;
const pasa = (texto: string) => console.log(`OK ${++grupos} · ${texto}`);
try {
  const org = await dbRaw.org.create({ data: { nombre: "Clínica autoservicio", slug: `autoservicio-${marca}` } });
  const otra = await dbRaw.org.create({ data: { nombre: "Otra empresa", slug: `autoservicio-ajena-${marca}` } });
  const ajeno = await runWithOrg(otra.id, async () => ({
    doctor: await db.doctor.create({ data: { nombre: "Especialista ajeno" } }),
    contacto: await db.contacto.create({ data: { nombre: `EXTERNO-${marca}`, telefono: "529619998877" } }),
  }));
  const f = await runWithOrg(org.id, async () => {
    await db.moduloOrg.createMany({ data: [
      { clave: "citas", activo: true, config: { puestosPermitidos: ["Agente"] } },
      { clave: "clientes", activo: true, config: { puestosPermitidos: ["Agente"] } },
      { clave: "pacientes", activo: true, config: { puestosPermitidos: ["Agente"] } },
      { clave: "reservas_en_linea", activo: true, config: { zona, anticipacionMin: 0, granularidadMin: 15, ventanaDias: 30 } },
    ] });
    const d1 = await db.doctor.create({ data: { nombre: "Ana Especialista" } });
    const d2 = await db.doctor.create({ data: { nombre: "Beatriz Especialista" } });
    await db.horarioDoctor.createMany({ data: [d1, d2].flatMap((d) => Array.from({ length: 7 }, (_, diaSemana) => ({ doctorId: d.id, diaSemana, inicioMin: 480, finMin: 1200 }))) });
    const servicio = await db.servicioReserva.create({ data: { nombre: "Valoración con margen", duracionMin: 30, bufferMin: 15, doctores: { create: [{ doctorId: d1.id }, { doctorId: d2.id }] } } });
    const hash = await bcrypt.hash(password, 10);
    const admin = await db.usuario.create({ data: { nombre: "Recepción", email: `admin-${marca}@local.test`, passwordHash: hash, rol: "admin" } });
    const propia = await db.usuario.create({ data: { nombre: "Ana usuario", email: `ana-${marca}@local.test`, passwordHash: hash, puesto: "Agente", agendaSoloPropia: true, agendaDoctorId: d1.id } });
    const total = await db.usuario.create({ data: { nombre: "Recepción agente", email: `total-${marca}@local.test`, passwordHash: hash, puesto: "Agente" } });
    const sinVinculo = await db.usuario.create({ data: { nombre: "Sin vínculo", email: `sin-${marca}@local.test`, passwordHash: hash, puesto: "Agente", agendaSoloPropia: true } });
    await db.contacto.createMany({ data: Array.from({ length: 505 }, (_, i) => ({ nombre: `A contacto ${String(i).padStart(4, "0")}` })) });
    const contacto = await db.contacto.create({ data: { nombre: `Z Contacto Buscable ${marca}`, telefono: "529611234567", expediente: { create: {} } } });
    const expediente = await db.expedientePaciente.findUniqueOrThrow({ where: { contactoId: contacto.id } });
    const c1 = await db.cita.create({ data: { titulo: `CITA-PROPIA-${marca}`, contactoId: contacto.id, doctorId: d1.id, inicio: new Date(iso(540)), fin: new Date(iso(570)) } });
    const c2 = await db.cita.create({ data: { titulo: `CITA-OTRA-${marca}`, contactoId: contacto.id, doctorId: d2.id, inicio: new Date(iso(540)), fin: new Date(iso(570)) } });
    const sinDoctor = await db.cita.create({ data: { titulo: `SIN-ASIGNAR-${marca}`, contactoId: contacto.id, inicio: new Date(iso(540)), fin: new Date(iso(570)) } });
    await db.evolucionClinica.create({ data: { expedienteId: expediente.id, citaId: c2.id, contenido: `EVOLUCION-OTRA-${marca}` } });
    const cancelada = await db.cita.create({ data: { titulo: "Cancelada ajena", contactoId: contacto.id, doctorId: d2.id, inicio: new Date(iso(570)), fin: new Date(iso(600)), estado: "cancelada" } });
    const publica = await db.cita.create({ data: { titulo: servicio.nombre, contactoId: contacto.id, doctorId: d1.id, servicioId: servicio.id, inicio: new Date(iso(720)), fin: new Date(iso(765)), origen: "en_linea", tokenGestion: crypto.randomBytes(16).toString("hex"), recordatorioEnviadoAt: new Date(), recordatorioIntentos: 2 } });
    const publica2 = await db.cita.create({ data: { titulo: servicio.nombre, contactoId: contacto.id, doctorId: d1.id, servicioId: servicio.id, inicio: new Date(iso(780)), fin: new Date(iso(825)), origen: "en_linea", tokenGestion: crypto.randomBytes(16).toString("hex") } });
    return { d1, d2, servicio, admin, propia, total, sinVinculo, contacto, c1, c2, sinDoctor, cancelada, publica, publica2 };
  });
  async function login(email: string) {
    const csrf = await fetch(`${base}/api/auth/csrf`), inicial = cookieDe(csrf);
    const { csrfToken } = await csrf.json();
    const res = await fetch(`${base}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { Cookie: inicial, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken, email, password, orgSlug: org.slug, json: "true" }) });
    const cookie = `${inicial}; ${cookieDe(res)}`; assert.match(cookie, /next-auth.session-token/); return cookie;
  }
  const admin = await login(f.admin.email), propia = await login(f.propia.email), total = await login(f.total.email), sin = await login(f.sinVinculo.email);
  const http = (ruta: string, cookie = propia, method = "GET", body?: unknown) => fetch(`${base}${ruta}`, { method, redirect: "manual", headers: { Cookie: cookie, "Content-Type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const json = async (res: Response, status = 200) => { const body = await res.json(); assert.equal(res.status, status, JSON.stringify(body)); return body; };
  const rango = `/api/citas?${new URLSearchParams({ desde: iso(480), hasta: iso(1200) })}`;
  let data = await json(await http(`/api/citas/contactos?q=${encodeURIComponent("z contacto buscable")}`));
  assert.equal(data.contactos[0].id, String(f.contacto.id)); assert.equal(data.contactos.length, 1);
  data = await json(await http("/api/citas/contactos?q=961%20123%204567")); assert.equal(data.contactos[0].id, String(f.contacto.id));
  data = await json(await http("/api/citas/contactos")); assert.equal(data.contactos.length, 30); assert.equal(data.hayMas, true);
  assert.equal((await json(await http(`/api/citas/contactos?q=EXTERNO-${marca}`))).contactos.length, 0);
  await json(await http(`/api/citas/contactos?q=${"a".repeat(101)}`), 400);
  const sinSesion = await http("/api/citas/contactos", "");
  assert.ok([401, 307].includes(sinSesion.status));
  if (sinSesion.status === 307) assert.match(sinSesion.headers.get("location")!, /^\/(login|api\/auth\/signin)(\?|$)/);
  pasa("búsqueda después de 500 contactos por nombre/teléfono, límite, sesión y aislamiento");

  data = await json(await http(rango));
  assert.ok(data.citas.some((c: { id: string }) => c.id === String(f.c1.id)));
  assert.ok(data.citas.every((c: { doctor: { id: string } | null }) => c.doctor?.id === String(f.d1.id)));
  assert.ok((await json(await http(rango, total))).citas.some((c: { id: string }) => c.id === String(f.sinDoctor.id)));
  assert.equal((await json(await http(rango, sin))).citas.length, 0);
  await json(await http(`/api/citas/${f.c2.id}`, propia, "PATCH", { notas: "prohibido" }), 404);
  await json(await http(`/api/citas/${f.cancelada.id}`, propia, "DELETE"), 404);
  await json(await http(`/api/doctores/${f.d2.id}`, propia, "PATCH", { activo: false }), 403);
  await json(await http("/api/doctores", propia, "POST", { nombre: "No autorizado" }), 403);
  for (const doctorId of [String(f.d2.id), null]) await json(await http(`/api/citas/${f.c1.id}`, propia, "PATCH", { doctorId }), 403);
  const nueva = { contactoId: String(f.contacto.id), titulo: "Alta propia", inicio: iso(660), fin: iso(690) };
  for (const doctorId of [String(f.d2.id), null]) await json(await http("/api/citas", propia, "POST", { ...nueva, doctorId }), 403);
  await json(await http("/api/citas", propia, "POST", { ...nueva, doctorId: String(f.d1.id) }), 201);
  pasa("agenda propia: lectura, creación, edición, borrado y reasignación protegidos en servidor");

  for (const ruta of ["/api/clientes", "/api/pacientes"]) {
    const texto = JSON.stringify(await json(await http(ruta)));
    assert.ok(texto.includes(f.c1.titulo)); assert.ok(!texto.includes(f.c2.titulo)); assert.ok(!texto.includes(f.sinDoctor.titulo));
  }
  for (const ruta of ["/citas", `/clientes/${f.contacto.id}`, `/pacientes/${f.contacto.id}`, "/clientes", "/pacientes"]) {
    const res = await http(ruta); assert.equal(res.status, 200); const texto = await res.text();
    assert.ok(!texto.includes(f.c2.titulo), ruta); assert.ok(!texto.includes(`EVOLUCION-OTRA-${marca}`), ruta);
  }
  await json(await http(`/api/contactos/${f.contacto.id}/expediente`, propia, "POST", { contenido: "No asociar cita ajena", citaId: String(f.c2.id) }), 400);
  pasa("fichas, listados y evolución clínica no filtran citas de otro especialista");

  await json(await http(`/api/usuarios/${f.propia.id}`, propia, "PATCH", { agendaSoloPropia: false }), 403);
  await json(await http(`/api/usuarios/${f.propia.id}`, admin, "PATCH", { agendaSoloPropia: true, agendaDoctorId: String(ajeno.doctor.id) }), 400);
  await json(await http(`/api/usuarios/${f.propia.id}`, admin, "PATCH", { agendaSoloPropia: true, agendaDoctorId: "9223372036854775808" }), 400);
  await json(await http(`/api/usuarios/${f.propia.id}`, admin, "PATCH", { agendaSoloPropia: true, agendaDoctorId: String(f.d2.id) }));
  assert.ok((await json(await http(rango))).citas.every((c: { doctor: { id: string } | null }) => c.doctor?.id === String(f.d2.id)));
  await json(await http(`/api/usuarios/${f.propia.id}`, admin, "PATCH", { agendaDoctorId: null }));
  assert.equal((await json(await http(rango))).citas.length, 0);
  await json(await http(`/api/usuarios/${f.propia.id}`, admin, "PATCH", { agendaSoloPropia: true, agendaDoctorId: String(f.d1.id) }));
  pasa("solo admin asigna acceso, rechaza especialista ajeno y aplica cambios sin esperar al JWT; vínculo nulo cierra acceso");

  const ruta = `/api/public/reservas/cita/${f.publica.tokenGestion}`;
  data = await json(await http(ruta, "")); assert.equal(data.reprogramable, true); assert.equal(data.zona, zona);
  assert.ok(!JSON.stringify(data).includes(f.contacto.nombre)); assert.ok(!("contactoId" in data));
  const dias = await json(await http(`${ruta}?desde=${fecha}`, "")); assert.ok(dias.dias.includes(fecha));
  const horarios = await json(await http(`${ruta}?fecha=${fecha}`, "")); assert.ok(horarios.horarios.includes(iso(720)), "se excluye a sí misma"); assert.ok(!horarios.horarios.includes(iso(780)), "otra cita ocupa su duración y margen");
  await json(await http(`${ruta}?fecha=2026-02-30`, ""), 400);
  await json(await http("/api/public/reservas/cita/invalido", ""), 404);
  await json(await http(ruta, "", "POST", null), 400);
  await json(await http(ruta, "", "POST", { accion: "reprogramar", inicio: iso(840), inicioOriginal: "viejo" }), 409);
  const cambio = { accion: "reprogramar", inicio: iso(840), inicioOriginal: iso(720) };
  data = await json(await http(ruta, "", "POST", cambio)); assert.equal(data.cita.inicio, iso(840));
  await json(await http(ruta, "", "POST", cambio), 409);
  const guardada = await runWithOrg(org.id, () => db.cita.findFirstOrThrow({ where: { id: f.publica.id } }));
  assert.equal(+guardada.fin - +guardada.inicio, 45 * 60_000); assert.equal(guardada.doctorId, f.d1.id); assert.equal(guardada.servicioId, f.servicio.id); assert.equal(guardada.recordatorioEnviadoAt, null); assert.equal(guardada.recordatorioIntentos, 0);
  pasa("reprogramación pública: misma cita/servicio/especialista/margen, sin datos personales, aviso reiniciado y versión obsoleta rechazada");

  const ruta2 = `/api/public/reservas/cita/${f.publica2.tokenGestion}`;
  const carrera = await Promise.all([
    http(ruta, "", "POST", { accion: "reprogramar", inicio: iso(960), inicioOriginal: iso(840) }),
    http(ruta2, "", "POST", { accion: "reprogramar", inicio: iso(960), inicioOriginal: iso(780) }),
  ]);
  assert.deepEqual(carrera.map((r) => r.status).sort(), [200, 409]);
  assert.equal(await runWithOrg(org.id, () => db.cita.count({ where: { doctorId: f.d1.id, inicio: new Date(iso(960)) } })), 1);
  const actual = await json(await http(ruta, ""));
  await runWithOrg(org.id, () => db.excepcionHorario.create({ data: { doctorId: f.d1.id, fecha: new Date(`${fecha}T00:00:00Z`) } }));
  await json(await http(ruta, "", "POST", { accion: "reprogramar", inicio: iso(1020), inicioOriginal: actual.inicio }), 409);
  await runWithOrg(org.id, () => db.excepcionHorario.deleteMany({ where: { doctorId: f.d1.id } }));
  await runWithOrg(org.id, () => db.servicioReserva.update({ where: { id: f.servicio.id }, data: { activo: false } }));
  assert.equal((await json(await http(ruta, ""))).reprogramable, false);
  await json(await http(ruta, "", "POST", { accion: "reprogramar", inicio: iso(1020), inicioOriginal: actual.inicio }), 409);
  await json(await http(ruta, "", "POST", { accion: "cancelar" }));
  await json(await http(ruta, "", "POST", { accion: "reprogramar", inicio: iso(1020), inicioOriginal: actual.inicio }), 409);
  await runWithOrg(org.id, () => db.servicioReserva.update({ where: { id: f.servicio.id }, data: { activo: true } }));
  pasa("dos clientes compiten por un horario: solo uno cambia; cierre, servicio retirado y cita cancelada rechazan cambios");

  const visual = await runWithOrg(org.id, () => db.cita.create({ data: { titulo: f.servicio.nombre, contactoId: f.contacto.id, doctorId: f.d1.id, servicioId: f.servicio.id, inicio: new Date(iso(1050)), fin: new Date(iso(1095)), origen: "en_linea", tokenGestion: crypto.randomBytes(16).toString("hex") } }));
  await mkdir("../docs/pruebas-citas-autoservicio-2026-10-19", { recursive: true });
  await writeFile("../docs/pruebas-citas-autoservicio-2026-10-19/visual.json", JSON.stringify({ slug: org.slug, emailAdmin: f.admin.email, emailEspecialista: f.propia.email, fecha, contactoId: String(f.contacto.id), token: visual.tokenGestion }, null, 2));
  console.log(`${grupos} grupos de autoservicio aprobados con sesiones HTTP reales. Solo datos sintéticos.`);
} finally { await dbRaw.$disconnect(); }
