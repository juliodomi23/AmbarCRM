import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import bcrypt from "bcryptjs";

const require = createRequire(import.meta.url);
const { db, dbRaw, runWithOrg }: typeof import("../../src/lib/db") = require("../../src/lib/db.ts");
const { fechaLocal, sumarDias, instanteLocal }: typeof import("../../src/lib/reservas/horarios") = require("../../src/lib/reservas/horarios.ts");
const base = process.env.E2E_BASE_URL!;
assert.equal(new URL(base).port, "3118");
assert.equal(new URL(process.env.DATABASE_URL!).port, "55450");
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const marca = Date.now(), password = "Belleza-local-2026", zona = "America/Cancun";
const fecha = sumarDias(fechaLocal(new Date(), zona), 2);
const iso = (min: number) => instanteLocal(fecha, min, zona).toISOString();
const cookies = (r: Response) => r.headers.getSetCookie().map((c) => c.split(";", 1)[0]).join("; ");
let grupos = 0;
const pasa = (mensaje: string) => console.log(`OK ${++grupos} · ${mensaje}`);

try {
  const org = await dbRaw.org.create({ data: { nombre: "Luna · Uñas, pestañas y spa", slug: `belleza-${marca}` } });
  const f = await runWithOrg(org.id, async () => {
    await db.moduloOrg.createMany({ data: [
      { clave: "clientes", activo: true }, { clave: "citas", activo: true },
      { clave: "reservas_en_linea", activo: true, config: { zona, anticipacionMin: 0, granularidadMin: 15, maxPorTelefono: 10 } },
    ] });
    const admin = await db.usuario.create({ data: { nombre: "Recepción Luna", email: `belleza-${marca}@local.test`, passwordHash: await bcrypt.hash(password, 10), rol: "admin" } });
    const una = await db.doctor.create({ data: { nombre: "Sofía · Uñas y pestañas" } });
    const dos = await db.doctor.create({ data: { nombre: "Valeria · Uñas y spa" } });
    await db.horarioDoctor.createMany({ data: [una, dos].flatMap((d) => Array.from({ length: 7 }, (_, diaSemana) => [
      { doctorId: d.id, diaSemana, inicioMin: 540, finMin: 780 },
      { doctorId: d.id, diaSemana, inicioMin: 840, finMin: 1140 },
    ]).flat()) });
    const servicios = await Promise.all([
      { nombre: "Manicure con gel", descripcion: "Preparación, color y acabado. Retiro previo se agenda por separado.", duracionMin: 90, bufferMin: 15, precio: 450, ids: [una.id, dos.id] },
      { nombre: "Extensiones de pestañas", descripcion: "Aplicación de set clásico, según el estilo elegido en tu visita.", duracionMin: 120, bufferMin: 20, precio: 850, ids: [una.id] },
      { nombre: "Masaje relajante", descripcion: "Sesión de 60 minutos. Indica tus preferencias de presión en las notas.", duracionMin: 60, bufferMin: 15, precio: 600, ids: [dos.id] },
    ].map(({ ids, ...data }) => db.servicioReserva.create({ data: { ...data, doctores: { create: ids.map((doctorId) => ({ doctorId })) } } })));
    await db.contacto.createMany({ data: Array.from({ length: 505 }, (_, i) => ({ nombre: `Contacto inicial ${String(i).padStart(3, "0")}` })) });
    const existente = await db.contacto.create({ data: { nombre: "Zoe contacto para ficha", telefono: "529611234580" } });
    return { admin, una, dos, servicios, existente };
  });
  const csrf = await fetch(`${base}/api/auth/csrf`), inicial = cookies(csrf), { csrfToken } = await csrf.json();
  const login = await fetch(`${base}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { Cookie: inicial, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken, password, email: f.admin.email, orgSlug: org.slug, json: "true" }) });
  const cookie = `${inicial}; ${cookies(login)}`; assert.match(cookie, /next-auth.session-token/);
  const http = (ruta: string, method = "GET", body?: unknown, publico = false) => fetch(`${base}${ruta}`, { method, redirect: "manual", headers: { Cookie: publico ? "" : cookie, "Content-Type": "application/json", "x-real-ip": "127.0.0.44" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const json = async (r: Response, status = 200) => { const data = await r.json(); assert.equal(r.status, status, JSON.stringify(data)); return data; };

  const busqueda = await json(await http("/api/clientes?sinFicha=1&q=Zoe"));
  assert.equal(busqueda.contactos.length, 1); assert.equal(busqueda.contactos[0].id, String(f.existente.id));
  const convertir = { contactoId: String(f.existente.id), alergias: "Sensibilidad al adhesivo", antecedentes: "Uñas almendradas, tonos nude" };
  await json(await http("/api/clientes", "POST", convertir), 201);
  await json(await http("/api/clientes", "POST", { contactoId: String(f.existente.id) }), 409);
  let ficha = await runWithOrg(org.id, () => db.expedientePaciente.findUniqueOrThrow({ where: { contactoId: f.existente.id } }));
  assert.equal(ficha.alergias, convertir.alergias); assert.equal(ficha.antecedentes, convertir.antecedentes);
  await json(await http(`/api/contactos/${f.existente.id}/expediente`, "PATCH", { observaciones: "Prefiere cita por la mañana" }));
  ficha = await runWithOrg(org.id, () => db.expedientePaciente.findUniqueOrThrow({ where: { contactoId: f.existente.id } }));
  assert.equal(ficha.alergias, convertir.alergias); assert.equal(ficha.antecedentes, convertir.antecedentes);
  for (const invalido of [null, [], { nombre: "Fecha imposible", fechaNacimiento: "2026-02-30" }, { nombre: "Fecha futura", fechaNacimiento: "2099-01-01" }]) await json(await http("/api/clientes", "POST", invalido), 400);
  await json(await http(`/api/contactos/${f.existente.id}/expediente`, "PATCH", null), 400);
  await json(await http(`/api/contactos/${f.existente.id}/expediente`, "PATCH", { fechaNacimiento: "2026-02-30" }), 400);
  pasa("busca más allá de 500 contactos; convertir otra vez no borra la ficha; PATCH parcial conserva datos; fechas y cuerpos inválidos responden 400");

  // Control sin serializar: dos decisiones basadas en la misma lectura crean dos formatos del mismo teléfono.
  await runWithOrg(org.id, async () => {
    const lecturas = await Promise.all([db.contacto.count({ where: { telefono: { contains: "9611234590" } } }), db.contacto.count({ where: { telefono: { contains: "9611234590" } } })]);
    assert.deepEqual(lecturas, [0, 0]);
    const sinProteccion = await Promise.all(["9611234590", "+52 961 123 4590"].map((telefono) => db.contacto.create({ data: { nombre: "Control sin normalización", telefono } })));
    assert.equal(sinProteccion.length, 2);
    await db.contacto.deleteMany({ where: { id: { in: sinProteccion.map((c) => c.id) } } });
  });
  const carreras = await Promise.all(["961 123 4590", "+52 9611234590"].map((telefono) => http("/api/clientes", "POST", { nombre: "Mariana", telefono })));
  assert.deepEqual(carreras.map((r) => r.status).sort(), [201, 409]);
  const clienta = await runWithOrg(org.id, () => db.contacto.findFirstOrThrow({ where: { telefono: "529611234590" } }));
  await runWithOrg(org.id, () => db.contacto.create({ data: { nombre: "Teléfono antiguo con formato", telefono: "+52 961 123 4591" } }));
  await json(await http("/api/clientes", "POST", { nombre: "Duplicado antiguo", telefono: "9611234591" }), 409);
  pasa("sin protección hay dos contactos; normalización y bloqueo permiten una sola ficha concurrente; detecta formatos antiguos");

  const publica = `/api/public/reservas/${org.slug}`;
  const catalogo = await json(await http(publica, "GET", undefined, true));
  assert.equal(catalogo.zona, zona); assert.equal(catalogo.servicios.length, 3);
  assert.equal(catalogo.servicios.find((s: { nombre: string }) => s.nombre === "Extensiones de pestañas").doctores.length, 1);
  const [unas, pestanas, masaje] = f.servicios;
  const horarios = async (servicioId: bigint, doctor: string) => (await json(await http(`${publica}/horarios?${new URLSearchParams({ servicio: String(servicioId), doctor, fecha })}`, "GET", undefined, true))).horarios as string[];
  const libres = await horarios(pestanas.id, String(f.una.id));
  assert.ok(libres.includes(iso(540))); assert.ok(!libres.includes(iso(660)), "120 + 20 minutos no caben antes del descanso");
  const datos = { servicioId: String(unas.id), doctorId: String(f.una.id), fecha, horario: iso(540), nombre: "Mariana", telefono: "961 123 4590", notas: "Prefiero tonos nude" };
  const reserva = await json(await http(publica, "POST", datos, true), 201);
  const cita = await runWithOrg(org.id, () => db.cita.findFirstOrThrow({ where: { tokenGestion: reserva.token } }));
  assert.equal(cita.contactoId, clienta.id); assert.equal(+cita.fin - +cita.inicio, 105 * 60000);
  const disponibles = await horarios(pestanas.id, String(f.una.id));
  assert.ok(!disponibles.includes(iso(630)), "el margen de uñas bloquea el inicio inmediato de pestañas");
  assert.ok((await horarios(unas.id, String(f.una.id))).includes(iso(645)), "otro manicure cabe después del margen y antes del descanso");
  await json(await http(publica, "POST", { ...datos, servicioId: String(pestanas.id), doctorId: String(f.dos.id), horario: iso(840) }, true), 400);
  assert.ok((await horarios(masaje.id, String(f.dos.id))).includes(iso(540)), "otra especialista mantiene su agenda disponible");
  pasa("uñas 90+15, pestañas 120+20 y spa 60+15; descanso, margen, especialistas compatibles y reserva reutiliza la ficha");

  const nota = `/api/contactos/${clienta.id}/expediente`;
  await json(await http(nota, "POST", { contenido: "Gel nude, forma almendrada. Cuidados explicados.", citaId: String(cita.id), doctorId: String(f.dos.id) }), 400);
  const registro = await json(await http(nota, "POST", { contenido: "Gel nude, forma almendrada. Cuidados explicados.", citaId: String(cita.id) }), 201);
  assert.equal(registro.evolucion.doctor.id, String(f.una.id));
  await json(await http(nota, "POST", { contenido: "No debe guardarse", citaId: "invalido" }), 400);
  const ajena = await dbRaw.org.create({ data: { nombre: "Otro salón aislado", slug: `belleza-ajena-${marca}` } });
  const ajeno = await runWithOrg(ajena.id, () => db.contacto.create({ data: { nombre: "Contacto ajeno" } }));
  await json(await http("/api/clientes", "POST", { contactoId: String(ajeno.id) }), 404);
  const lista = await json(await http("/api/clientes?sinFicha=1&q=Contacto%20ajeno")); assert.equal(lista.contactos.length, 0);
  pasa("atención ligada a su cita y especialista real; referencias inválidas y contactos de otro salón rechazados");

  const out = new URL("../../../docs/pruebas-belleza-2026-10-19/", import.meta.url);
  await mkdir(out, { recursive: true });
  await writeFile(new URL("visual.json", out), JSON.stringify({ slug: org.slug, email: f.admin.email, clientaId: String(clienta.id), fichaId: String(f.existente.id), fecha, zona }, null, 2));
  console.log(`${grupos} grupos de belleza aprobados. Sin mensajes externos ni producción.`);
} finally { await dbRaw.$disconnect(); }
