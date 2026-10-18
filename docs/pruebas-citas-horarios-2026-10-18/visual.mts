import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { db, dbRaw, runWithOrg } from "../../web/src/lib/db";
import { fechaLocal, instanteLocal, sumarDias } from "../../web/src/lib/reservas/horarios";
const bcrypt = createRequire(new URL("../../web/package.json", import.meta.url))("bcryptjs");
const url = new URL(process.env.DATABASE_URL!);
assert.equal(url.port, "55450"); assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
const zona = "America/Mexico_City", fecha = sumarDias(fechaLocal(new Date(), zona), 1), marca = Date.now();
const org = await dbRaw.org.create({ data: { nombre: "Clínica · prueba local de horarios", slug: `visual-horarios-${marca}` } });
try {
  const fixture = await runWithOrg(org.id, async () => {
    const email = `horarios-visual-${marca}@local.test`, password = "Horarios-local-2026";
    await db.usuario.create({ data: { email, passwordHash: await bcrypt.hash(password, 10), nombre: "Recepción de prueba", rol: "admin", puesto: "Administrador" } });
    await db.ajustes.create({ data: { nombreNegocio: "Clínica · prueba local de horarios" } });
    await db.moduloOrg.createMany({ data: [{ clave: "citas", activo: true, config: { duracionMin: 45 } }, { clave: "reservas_en_linea", activo: true, config: { zona, anticipacionMin: 0 } }] });
    const contacto = await db.contacto.create({ data: { nombre: "Paciente de demostración" } });
    const especialista = await db.doctor.create({ data: { nombre: "Ana · especialista", especialidad: "Valoración" } });
    const sinHorario = await db.doctor.create({ data: { nombre: "Beatriz · sin horario" } });
    await db.doctor.create({ data: { nombre: "Especialista inactivo", activo: false } });
    await db.horarioDoctor.createMany({ data: Array.from({ length: 7 }, (_, diaSemana) => [
      { doctorId: especialista.id, diaSemana, inicioMin: 540, finMin: 720 },
      { doctorId: especialista.id, diaSemana, inicioMin: 840, finMin: 1080 },
    ]).flat() });
    await db.excepcionHorario.create({ data: { doctorId: especialista.id, fecha: new Date(`${sumarDias(fecha, 1)}T00:00:00Z`), motivo: "Cierre especial" } });
    const servicio = await db.servicioReserva.create({ data: { nombre: "Valoración inicial", duracionMin: 30, bufferMin: 15 } });
    await db.servicioReservaDoctor.create({ data: { servicioId: servicio.id, doctorId: especialista.id } });
    const cancelada = await db.cita.create({ data: { titulo: "Cita cancelada para eliminar", contactoId: contacto.id, doctorId: especialista.id, estado: "cancelada", inicio: instanteLocal(fecha, 600, zona), fin: instanteLocal(fecha, 630, zona) } });
    return { email, password, fecha, zona, slug: org.slug, contactoId: String(contacto.id), especialistaId: String(especialista.id), sinHorarioId: String(sinHorario.id), servicioId: String(servicio.id), canceladaId: String(cancelada.id) };
  });
  await writeFile("../docs/pruebas-citas-horarios-2026-10-18/visual.json", JSON.stringify(fixture, null, 2));
  console.log("Fixture visual sintético creado en PostgreSQL desechable");
} finally { await dbRaw.$disconnect(); }
