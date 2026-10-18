import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { writeFile, mkdir } from "node:fs/promises";
import { db, dbRaw, runWithOrg } from "../../src/lib/db";
import { fechaLocal, instanteLocal, sumarDias } from "../../src/lib/reservas/horarios";
import { inicioDeSemana } from "../../src/components/citas/fecha";

const base = process.env.E2E_BASE_URL!;
assert.equal(new URL(process.env.DATABASE_URL!).port, "55450");
assert.ok(["127.0.0.1", "localhost"].includes(new URL(base).hostname));
const cookieDe = (r: Response) => r.headers.getSetCookie().map((c) => c.split(";", 1)[0]).join("; ");
const marca = Date.now();
const escenarios = [
  { giro: "pequena", nombre: "Clínica pequeña", cantidad: 2, citas: 12, zona: "America/Mexico_City", servicio: "Valoración", duracionMin: 30, bufferMin: 0 },
  { giro: "grande", nombre: "Clínica grande", cantidad: 10, citas: 500, zona: "America/Cancun", servicio: "Consulta especializada", duracionMin: 30, bufferMin: 10 },
  { giro: "salon", nombre: "Salón de belleza", cantidad: 5, citas: 40, zona: "America/Mexico_City", servicio: "Manicure", duracionMin: 30, bufferMin: 15 },
];
const evidencias: object[] = [];
try {
  for (const escenario of escenarios) {
    const org = await dbRaw.org.create({ data: { nombre: escenario.nombre, slug: `citas-${escenario.giro}-${marca}` } });
    const email = `${escenario.giro}-${marca}@local.test`;
    const password = "Citas-local-2026";
    const fixture = await runWithOrg(org.id, async () => {
      await db.usuario.create({ data: { nombre: "Dueño recepción", email, passwordHash: await bcrypt.hash(password, 10), rol: "admin", puesto: "Administrador" } });
      await db.ajustes.create({ data: { nombreNegocio: escenario.nombre, marcaNombre: escenario.nombre } });
      await db.moduloOrg.createMany({ data: [
        { clave: "citas", activo: true, config: { puestosPermitidos: ["Recepcionista", "Doctor"] } },
        { clave: "reservas_en_linea", activo: true, config: { zona: escenario.zona, anticipacionMin: 0, ventanaDias: 30, granularidadMin: 30, maxPorTelefono: 3 } },
        { clave: escenario.giro === "salon" ? "clientes" : "pacientes", activo: true },
      ] });
      const contacto = await db.contacto.create({ data: { nombre: escenario.giro === "salon" ? "Clienta recurrente" : "Paciente de fixture", telefono: "529611112233" } });
      await db.expedientePaciente.create({ data: { contactoId: contacto.id } });
      const canal = await db.canalWhatsapp.create({ data: { nombre: "Bandeja local sin proveedor", proveedor: "api", config: {} } });
      const conv = await db.conversacion.create({ data: { contactoId: contacto.id, canalId: canal.id } });
      const doctores = await Promise.all(Array.from({ length: escenario.cantidad }, (_, i) => db.doctor.create({ data: { nombre: escenario.giro === "salon" ? `Técnica ${i + 1}` : `Especialista ${i + 1}`, especialidad: i % 2 ? "General" : "Especialidad", color: ["#0284c7", "#7c3aed", "#059669", "#d97706", "#db2777"][i % 5] } })));
      return { contacto, conv, doctores };
    });
    const csrf = await fetch(`${base}/api/auth/csrf`);
    const inicial = cookieDe(csrf);
    const { csrfToken } = await csrf.json();
    const login = await fetch(`${base}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { Cookie: inicial, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken, email, password, orgSlug: org.slug, json: "true" }) });
    const cookie = `${inicial}; ${cookieDe(login)}`; assert.match(cookie, /next-auth.session-token/);
    const http = (ruta: string, method = "GET", body?: object) => fetch(`${base}${ruta}`, { method, headers: { Cookie: cookie, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const servicioRes = await http("/api/reservas/servicios", "POST", { nombre: escenario.servicio, duracionMin: escenario.duracionMin, bufferMin: escenario.bufferMin, precio: "350.00", doctorIds: fixture.doctores.map((d) => String(d.id)).join(",") });
    assert.equal(servicioRes.status, 201); const { servicio } = await servicioRes.json();
    for (const doctor of fixture.doctores) for (let diaSemana = 0; diaSemana < 7; diaSemana++) {
      assert.equal((await http("/api/reservas/horarios", "POST", { doctorId: String(doctor.id), diaSemana, inicio: "08:00", fin: "20:00" })).status, 201);
    }
    const fecha = sumarDias(fechaLocal(new Date(), escenario.zona), 2);
    const inicio = instanteLocal(fecha, 1200, escenario.zona);
    const fin = new Date(+inicio + 30 * 60_000);
    const body = { contactoId: String(fixture.contacto.id), conversacionId: String(fixture.conv.id), doctorId: String(fixture.doctores[0].id), titulo: "Cita desde conversación", inicio: inicio.toISOString(), fin: fin.toISOString() };
    const creada = await http("/api/citas", "POST", body); assert.equal(creada.status, 201);
    const { cita, avisos } = await creada.json(); assert.equal(avisos.length, 1);
    assert.equal((await http(`/api/citas/${cita.id}`, "PATCH", { inicio: new Date(+inicio + 3600_000).toISOString(), fin: new Date(+fin + 3600_000).toISOString(), doctorId: String(fixture.doctores[1].id), titulo: "Movida por recepción" })).status, 200);
    for (const estado of ["confirmada", "en_sala", "completada"]) assert.equal((await http(`/api/citas/${cita.id}`, "PATCH", { estado })).status, 200);
    assert.equal((await http(`/api/citas/${cita.id}`, "PATCH", { estado: "programada" })).status, 409);
    const noAsistio = await http("/api/citas", "POST", { ...body, doctorId: null, titulo: "No asistió" }); const ausente = await noAsistio.json();
    assert.equal((await http(`/api/citas/${ausente.cita.id}`, "PATCH", { estado: "no_asistio" })).status, 200);
    const publico = await (await fetch(`${base}/api/public/reservas/${org.slug}`)).json();
    assert.equal(publico.zona, escenario.zona); assert.equal(publico.servicios[0].doctores.length, escenario.cantidad);
    const q = new URLSearchParams({ servicio: String(servicio.id), doctor: "cualquiera", fecha });
    const horarios = await (await fetch(`${base}/api/public/reservas/${org.slug}/horarios?${q}`)).json();
    assert.ok(horarios.horarios.length);
    const publica = await fetch(`${base}/api/public/reservas/${org.slug}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ servicioId: String(servicio.id), doctorId: "cualquiera", fecha, horario: horarios.horarios[0], nombre: "Cliente web de fixture", telefono: `961000000${escenario.giro === "pequena" ? 1 : escenario.giro === "grande" ? 2 : 3}` }) });
    assert.equal(publica.status, 201); const reserva = await publica.json();
    const detalle = await (await fetch(`${base}/api/public/reservas/cita/${reserva.token}`)).json();
    assert.equal(detalle.especialista, reserva.especialista); assert.equal(detalle.zona, escenario.zona);
    const semana = inicioDeSemana(fechaLocal(new Date(), escenario.zona));
    await runWithOrg(org.id, async () => {
      await db.cita.createMany({ data: Array.from({ length: escenario.citas }, (_, i) => {
        const inicio = instanteLocal(sumarDias(semana, Math.floor(i / (escenario.cantidad * 8)) % 7), 480 + (Math.floor(i / escenario.cantidad) % 8) * 60, escenario.zona);
        return { contactoId: fixture.contacto.id, doctorId: fixture.doctores[i % escenario.cantidad].id, titulo: `${escenario.servicio} ${i + 1}`, inicio, fin: new Date(+inicio + 45 * 60_000) };
      }) });
      const noche = instanteLocal(sumarDias(semana, 2), 1410, escenario.zona);
      await db.cita.create({ data: { contactoId: fixture.contacto.id, doctorId: fixture.doctores[0].id, titulo: "Cruza medianoche", inicio: noche, fin: new Date(+noche + 3600_000) } });
    });
    const desde = instanteLocal(semana, 0, escenario.zona).toISOString(), hasta = instanteLocal(sumarDias(semana, 7), 0, escenario.zona).toISOString();
    let cursor: string | null = null; const ids: string[] = []; const t = performance.now();
    do {
      const q: URLSearchParams = new URLSearchParams({ desde, hasta, ...(cursor ? { cursor } : {}) });
      const pagina: { citas: { id: string }[]; siguienteCursor: string | null } = await (await http(`/api/citas?${q}`)).json();
      ids.push(...pagina.citas.map((c) => c.id)); cursor = pagina.siguienteCursor;
    } while (cursor);
    assert.equal(new Set(ids).size, ids.length); assert.ok(ids.length >= escenario.citas);
    const ms = Math.round(performance.now() - t);
    const html = await (await http("/citas")).text(); assert.ok(!html.includes("passwordHash")); assert.match(html, /Filtrar por especialista/);
    assert.match(await (await http("/reservas-en-linea")).text(), /Copiar/);
    evidencias.push({ ...escenario, slug: org.slug, email, contactoId: String(fixture.contacto.id), conversacionId: String(fixture.conv.id), token: reserva.token, servicioId: String(servicio.id), semana, filas: ids.length, consultaMs: ms });
    console.log(`OK · ${escenario.nombre}: configuración HTTP, bandeja precargada, mover, estados, reserva pública, token, ${ids.length} citas paginadas en ${ms} ms`);
  }
  await mkdir("../docs/pruebas-citas-2026-10-17", { recursive: true });
  await writeFile("../docs/pruebas-citas-2026-10-17/fixtures.json", JSON.stringify(evidencias, null, 2));
} finally { await dbRaw.$disconnect(); }
