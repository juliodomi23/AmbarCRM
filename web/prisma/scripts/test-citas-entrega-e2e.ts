import assert from "node:assert/strict";
import { createRequire } from "node:module";
import bcrypt from "bcryptjs";
import { mkdir, writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
const { db, dbRaw, runWithOrg }: typeof import("../../src/lib/db") = require("../../src/lib/db.ts");
const { recordatoriosDeLaEmpresa, conteoRecordatorios }: typeof import("../../src/lib/recordatorios-envio") = require("../../src/lib/recordatorios-envio.ts");
const { fechaLocal, instanteLocal, sumarDias }: typeof import("../../src/lib/reservas/horarios") = require("../../src/lib/reservas/horarios.ts");
const base = process.env.E2E_BASE_URL!;
assert.equal(new URL(process.env.DATABASE_URL!).port, "55450");
assert.equal(new URL(base).port, "3118");
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const marca = Date.now(), zona = "America/Tijuana", password = "Entrega-citas-local-2026";
const fecha = sumarDias(fechaLocal(new Date(), zona), 2);
const iso = (min: number) => instanteLocal(fecha, min, zona).toISOString();
const urlAnterior = process.env.NEXTAUTH_URL;
const cookieDe = (r: Response) => r.headers.getSetCookie().map((c) => c.split(";", 1)[0]).join("; ");
let grupos = 0;
const pasa = (texto: string) => console.log(`OK ${++grupos} · ${texto}`);
try {
  const org = await dbRaw.org.create({ data: { nombre: "Consultorio de entrega", slug: `entrega-${marca}` } });
  const f = await runWithOrg(org.id, async () => {
    await db.moduloOrg.createMany({ data: [{ clave: "citas", activo: true, config: { puestosPermitidos: ["Agente"] } }, { clave: "pacientes", activo: true }, { clave: "clientes", activo: true }, { clave: "reservas_en_linea", activo: true, config: { zona, anticipacionMin: 0 } }] });
    const doctor = await db.doctor.create({ data: { nombre: "Ana Especialista" } });
    const otroDoctor = await db.doctor.create({ data: { nombre: "Otro especialista" } });
    const hash = await bcrypt.hash(password, 10);
    const admin = await db.usuario.create({ data: { nombre: "Recepción", email: `recepcion-${marca}@local.test`, passwordHash: hash, rol: "admin" } });
    const otro = await db.usuario.create({ data: { nombre: "Otro usuario", email: `otro-${marca}@local.test`, passwordHash: hash, agendaSoloPropia: true, agendaDoctorId: otroDoctor.id } });
    const paciente = await db.contacto.create({ data: { nombre: "Paciente con ficha", telefono: "529611112233", expediente: { create: {} } } });
    const nuevo = await db.contacto.create({ data: { nombre: "Paciente nuevo sin conversación", telefono: "529611112244" } });
    const canal = await db.canalWhatsapp.create({ data: { nombre: "WhatsApp oficial de prueba", proveedor: "cloud_api", config: { canalElegido: "oficial" } } });
    const canalAnterior = await db.canalWhatsapp.create({ data: { nombre: "Otro canal", proveedor: "api", config: {} } });
    const conversacionAnterior = await db.conversacion.create({ data: { contactoId: paciente.id, canalId: canalAnterior.id } });
    return { doctor, admin, otro, paciente, nuevo, canal, conversacionAnterior };
  });
  async function login(email: string) {
    const csrf = await fetch(`${base}/api/auth/csrf`), inicial = cookieDe(csrf), { csrfToken } = await csrf.json();
    const res = await fetch(`${base}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { Cookie: inicial, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken, email, password, orgSlug: org.slug, json: "true" }) });
    const cookie = `${inicial}; ${cookieDe(res)}`; assert.match(cookie, /next-auth.session-token/); return cookie;
  }
  const admin = await login(f.admin.email), otro = await login(f.otro.email);
  const http = (ruta: string, method = "GET", body?: unknown, cookie = admin) => fetch(`${base}${ruta}`, { method, redirect: "manual", headers: { Cookie: cookie, "Content-Type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const json = async (res: Response, status = 200) => { const data = await res.json(); assert.equal(res.status, status, JSON.stringify(data)); return data; };
  const creada = (await json(await http("/api/citas", "POST", { contactoId: String(f.paciente.id), conversacionId: String(f.conversacionAnterior.id), doctorId: String(f.doctor.id), titulo: "Consulta de prueba", inicio: iso(600), fin: iso(630) }), 201)).cita;
  assert.match(creada.tokenGestion, /^[0-9a-f]{32}$/);
  await runWithOrg(org.id, () => db.cita.update({ where: { id: BigInt(creada.id) }, data: { tokenGestion: null } }));
  const enlaces = await Promise.all([http(`/api/citas/${creada.id}/enlace`, "POST"), http(`/api/citas/${creada.id}/enlace`, "POST")]);
  const e1 = await json(enlaces[0]), e2 = await json(enlaces[1]);
  assert.equal(e1.enlace, e2.enlace); assert.match(e1.enlace, /\/reservar\/cita\/[0-9a-f]{32}$/);
  await json(await http(`/api/citas/${creada.id}/enlace`, "POST", undefined, otro), 404);
  await json(await http("/api/citas/9223372036854775808/enlace", "POST"), 404);
  pasa("cita interna tiene enlace; dos solicitudes a una cita antigua conservan un token; agenda ajena y BIGINT rechazados");

  const token = e1.enlace.split("/").at(-1)!;
  const publica = `/api/public/reservas/cita/${token}`;
  let detalle = await json(await http(publica, "GET", undefined, ""));
  assert.equal(detalle.confirmable, true); assert.equal(detalle.reprogramable, false);
  await json(await http(publica, "POST", { accion: "confirmar", inicioOriginal: iso(660) }, ""), 409);
  for (let i = 0; i < 2; i++) await json(await http(publica, "POST", { accion: "confirmar", inicioOriginal: iso(600) }, ""));
  detalle = await json(await http(publica, "GET", undefined, "")); assert.equal(detalle.estado, "confirmada"); assert.equal(detalle.confirmable, false);
  await json(await http(publica, "POST", { accion: "cancelar" }, ""));
  await json(await http(publica, "POST", { accion: "confirmar", inicioOriginal: iso(600) }, ""), 409);
  await runWithOrg(org.id, () => db.cita.update({ where: { id: BigInt(creada.id) }, data: { estado: "confirmada" } }));
  const carreraToken = "cc" + String(marca).padStart(30, "0");
  const carrera = await runWithOrg(org.id, () => db.cita.create({ data: { contactoId: f.paciente.id, titulo: "Confirmar contra cancelar", inicio: new Date(iso(640)), fin: new Date(iso(650)), tokenGestion: carreraToken } }));
  const respuestas = await Promise.all([
    http(`/api/public/reservas/cita/${carreraToken}`, "POST", { accion: "confirmar", inicioOriginal: iso(640) }, ""),
    http(`/api/public/reservas/cita/${carreraToken}`, "POST", { accion: "cancelar" }, ""),
  ]);
  assert.ok([200, 409].includes(respuestas[0].status)); assert.equal(respuestas[1].status, 200);
  assert.equal((await runWithOrg(org.id, () => db.cita.findFirstOrThrow({ where: { id: carrera.id } }))).estado, "cancelada");
  pasa("confirmación pública con versión de horario, reintento idempotente y cancelación sin reapertura");

  const sinChat = await runWithOrg(org.id, () => db.cita.create({ data: { contactoId: f.nuevo.id, doctorId: f.doctor.id, titulo: "Reserva sin conversación", inicio: new Date(iso(660)), fin: new Date(iso(690)), origen: "en_linea" } }));
  await json(await http("/api/modulos", "PATCH", { clave: "citas", config: { canalId: String(f.canal.id), plantilla: { name: "recordatorio_local", language: "es_MX" }, anticipacionHoras: 24, mapeoVariables: ["nombre_contacto", "fecha_hora", "enlace_gestion"] } }));
  await json(await http("/api/modulos", "PATCH", { clave: "citas", config: { mapeoVariables: ["variable_inexistente"] } }), 400);
  const envios: { telefono: string; valores: string[] }[] = [];
  const proveedor: typeof import("../../src/lib/channel").getProvider = (_nombre, config) => {
    assert.equal((config as { canalElegido?: string }).canalElegido, "oficial");
    return { nombre: "cloud_api", normalizarEntrante: () => [], enviarTexto: async () => ({ ok: true }), enviarMedia: async () => ({ ok: true }), enviarPlantilla: async (telefono, _plantilla, valores) => {
      envios.push({ telefono, valores: valores ?? [] }); return { ok: true, waMessageId: `entrega-${marca}-${envios.length}` };
    } };
  };
  const ahora = new Date(+new Date(iso(600)) - 3600_000);
  const conteos = [conteoRecordatorios(), conteoRecordatorios()];
  await Promise.all(conteos.map((c) => runWithOrg(org.id, () => recordatoriosDeLaEmpresa(c, proveedor, ahora))));
  assert.equal(envios.length, 2); assert.equal(conteos.reduce((n, c) => n + c.enviados, 0), 2);
  await runWithOrg(org.id, async () => {
    for (const contacto of [f.paciente, f.nuevo]) {
      const conv = await db.conversacion.findFirstOrThrow({ where: { contactoId: contacto.id, canalId: f.canal.id } });
      assert.equal(await db.conversacion.count({ where: { contactoId: contacto.id, canalId: f.canal.id } }), 1);
      assert.equal(await db.mensaje.count({ where: { conversacionId: conv.id, status: "enviado" } }), 1);
    }
    assert.equal(await db.mensaje.count({ where: { conversacionId: f.conversacionAnterior.id } }), 0);
    const renovada = await db.cita.findFirstOrThrow({ where: { id: sinChat.id } });
    assert.match(renovada.tokenGestion!, /^[0-9a-f]{32}$/);
    assert.ok(envios.some((e) => e.valores[2].endsWith(renovada.tokenGestion!)));
  });
  assert.ok(envios.every((e) => e.valores[2].startsWith(`${base}/reservar/cita/`)));
  assert.ok(envios.find((e) => e.telefono === f.paciente.telefono)!.valores[1].includes("10:00"));
  pasa("dos crons: recordatorios sin chat previo, canal correcto, conversación única y enlace/horario en plantilla, sin duplicados");

  await runWithOrg(org.id, async () => {
    await db.cita.createMany({ data: Array.from({ length: 12 }, (_, i) => ({ contactoId: f.paciente.id, doctorId: f.doctor.id, titulo: `Consulta posterior ${i}`, inicio: new Date(+new Date(iso(600)) + (i + 1) * 86400000), fin: new Date(+new Date(iso(630)) + (i + 1) * 86400000) })) });
  });
  const textoHora = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: zona }).format(new Date(iso(600)));
  for (const ruta of ["/clientes", "/pacientes"]) {
    const res = await http(ruta); assert.equal(res.status, 200); const html = await res.text();
    assert.ok(html.includes(textoHora), `${ruta} muestra la próxima cita y la hora de Tijuana`);
  }
  const contactos = await http("/contactos"); assert.equal(contactos.status, 200);
  assert.ok((await contactos.text()).includes(`href="/citas?contactoId=${f.nuevo.id}"`), "contacto sin expediente tiene acción Cita");
  pasa("más de 10 citas: próxima correcta en Clientes/Pacientes, zona del negocio y alta desde contacto sin ficha");

  const sinUrl = await runWithOrg(org.id, () => db.cita.create({ data: { contactoId: f.nuevo.id, titulo: "Sin URL pública", inicio: new Date(iso(720)), fin: new Date(iso(750)) } }));
  process.env.NEXTAUTH_URL = "";
  await runWithOrg(org.id, () => recordatoriosDeLaEmpresa(conteoRecordatorios(), proveedor, ahora));
  assert.equal(envios.length, 2);
  const omitida = await runWithOrg(org.id, () => db.cita.findFirstOrThrow({ where: { id: sinUrl.id } })); assert.equal(omitida.recordatorioIntentos, 0);
  process.env.NEXTAUTH_URL = urlAnterior;
  await runWithOrg(org.id, () => db.canalWhatsapp.update({ where: { id: f.canal.id }, data: { activo: false } }));
  await runWithOrg(org.id, () => recordatoriosDeLaEmpresa(conteoRecordatorios(), proveedor, ahora));
  assert.equal(envios.length, 2);
  assert.equal((await runWithOrg(org.id, () => db.cita.findFirstOrThrow({ where: { id: sinUrl.id } }))).recordatorioIntentos, 0);
  await runWithOrg(org.id, () => db.canalWhatsapp.update({ where: { id: f.canal.id }, data: { activo: true } }));
  const visual = await runWithOrg(org.id, () => db.cita.create({ data: { contactoId: f.paciente.id, doctorId: f.doctor.id, titulo: "Consulta para confirmar", inicio: new Date(iso(840)), fin: new Date(iso(870)), tokenGestion: "ee" + String(marca).padStart(30, "0") } }));
  const out = "../docs/pruebas-citas-entrega-2026-10-19";
  await mkdir(out, { recursive: true }); await writeFile(`${out}/visual.json`, JSON.stringify({ slug: org.slug, email: f.admin.email, token: visual.tokenGestion, citaId: String(visual.id), pacienteId: String(f.paciente.id), fecha, zona }, null, 2));
  pasa("sin dirección pública no se envía enlace vacío ni se consume intento");
  console.log(`${grupos} grupos aprobados. Proveedor inyectado; no se enviaron mensajes reales.`);
} finally { process.env.NEXTAUTH_URL = urlAnterior; await dbRaw.$disconnect(); }
