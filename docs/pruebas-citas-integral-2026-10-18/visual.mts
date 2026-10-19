import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { db, dbRaw, runWithOrg } from "../../web/src/lib/db";
import { encryptMetaToken } from "../../web/src/lib/meta/credentials";
import { fechaLocal, instanteLocal, sumarDias } from "../../web/src/lib/reservas/horarios";
const bcrypt = createRequire(new URL("../../web/package.json", import.meta.url))("bcryptjs");
assert.equal(new URL(process.env.DATABASE_URL!).port, "55450");
const zona = "America/Tijuana", fecha = sumarDias(fechaLocal(new Date(), zona), 1), marca = Date.now();
const org = await dbRaw.org.create({ data: { nombre: "Clínica · revisión integral local", slug: `visual-integral-${marca}` } });
try {
  const fixture = await runWithOrg(org.id, async () => {
    const email = `integral-visual-${marca}@local.test`, password = "Citas-local-2026";
    await db.usuario.create({ data: { email, passwordHash: await bcrypt.hash(password, 10), nombre: "Recepción de prueba", rol: "admin", puesto: "Administrador" } });
    await db.ajustes.create({ data: { nombreNegocio: "Clínica · revisión integral local" } });
    const canal = await db.canalWhatsapp.create({ data: { nombre: "WhatsApp simulado local", proveedor: "cloud_api", config: { tokenEncrypted: encryptMetaToken("token-sintetico-local"), wabaId: "123", phoneNumberId: "456" } } });
    await db.moduloOrg.createMany({ data: [
      { clave: "citas", activo: true, config: { duracionMin: 45, canalId: String(canal.id), plantilla: { name: "recordatorio_local", language: "es_MX" }, mapeoVariables: ["nombre_contacto", "titulo_cita", "fecha_hora", "nombre_negocio"] } },
      { clave: "reservas_en_linea", activo: true, config: { zona, anticipacionMin: 0, granularidadMin: 5 } },
      { clave: "clientes", activo: true },
    ] });
    const contacto = await db.contacto.create({ data: { nombre: "Cliente nuevo sin expediente" } });
    const especialista = await db.doctor.create({ data: { nombre: "Ana · jornada extendida", especialidad: "Valoración" } });
    await db.doctor.create({ data: { nombre: "Beatriz · sin horario" } });
    await db.doctor.create({ data: { nombre: "Especialista inactivo", activo: false } });
    await db.horarioDoctor.createMany({ data: Array.from({ length: 7 }, (_, diaSemana) => [
      { doctorId: especialista.id, diaSemana, inicioMin: 360, finMin: 720 },
      { doctorId: especialista.id, diaSemana, inicioMin: 840, finMin: 1320 },
    ]).flat() });
    const servicio = await db.servicioReserva.create({ data: { nombre: "Valoración inicial", duracionMin: 30, bufferMin: 15 } });
    await db.servicioReservaDoctor.create({ data: { servicioId: servicio.id, doctorId: especialista.id } });
    await db.cita.create({ data: { titulo: "Cita de referencia", contactoId: contacto.id, doctorId: especialista.id, inicio: instanteLocal(fecha, 600, zona), fin: instanteLocal(fecha, 630, zona) } });
    return { email, password, fecha, zona, slug: org.slug, contactoId: String(contacto.id), especialistaId: String(especialista.id), servicioId: String(servicio.id) };
  });
  await writeFile("../docs/pruebas-citas-integral-2026-10-18/visual.json", JSON.stringify(fixture, null, 2));
  console.log("Fixture visual sintético creado en PostgreSQL desechable");
} finally { await dbRaw.$disconnect(); }
