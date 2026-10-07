// Uso: node scripts/seed-demo-clinica.mjs admin@demo.test ClaveSegura
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const [email, password] = process.argv.slice(2);
if (!email || !password) throw new Error("Uso: node scripts/seed-demo-clinica.mjs <email> <contraseña>");
const prisma = new PrismaClient();
const org = await prisma.org.upsert({ where: { slug: "demo-clinica" }, update: { nombre: "Demo Clínica", activo: true }, create: { nombre: "Demo Clínica", slug: "demo-clinica" } });
await prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe("SELECT set_config('app.current_org', $1, true)", String(org.id));
  const hash = await bcrypt.hash(password, 10);
  const admin = await tx.usuario.upsert({ where: { orgId_email: { orgId: org.id, email } }, update: { nombre: "Admin Clínica", passwordHash: hash, rol: "admin", activo: true }, create: { nombre: "Admin Clínica", email, passwordHash: hash, rol: "admin" } });
  await tx.ajustes.upsert({ where: { orgId: org.id }, update: { marcaPreset: "salud", marcaNombre: "Demo Clínica" }, create: { marcaPreset: "salud", marcaNombre: "Demo Clínica" } });
  await tx.moduloOrg.upsert({ where: { orgId_clave: { orgId: org.id, clave: "citas" } }, update: { activo: true, config: { anticipacionHoras: 24 } }, create: { clave: "citas", activo: true, config: { anticipacionHoras: 24 } } });
  const defs = [["tipo_tratamiento", "Tipo de tratamiento", "opcion", ["Consulta", "Limpieza", "Ortodoncia"]], ["alergias", "Alergias", "texto", []], ["primera_visita", "Primera visita", "si_no", []]];
  for (const [clave, etiqueta, tipo, opciones] of defs) await tx.campoPersonalizado.upsert({ where: { orgId_entidad_clave: { orgId: org.id, entidad: "contacto", clave } }, update: { etiqueta, tipo, opciones, activo: true }, create: { entidad: "contacto", clave, etiqueta, tipo, opciones } });
  const contacto = await tx.contacto.upsert({ where: { orgId_telefono: { orgId: org.id, telefono: "5550000001" } }, update: { nombre: "Ana García" }, create: { nombre: "Ana García", telefono: "5550000001", fuente: "manual", campos: { tipo_tratamiento: "Consulta", alergias: "Penicilina", primera_visita: true } } });
  let embudo = await tx.embudo.findFirst({ where: { nombre: "Pacientes" } });
  if (!embudo) embudo = await tx.embudo.create({ data: { nombre: "Pacientes", orden: 1 } });
  let etapa = await tx.etapa.findFirst({ where: { embudoId: embudo.id } });
  if (!etapa) etapa = await tx.etapa.create({ data: { embudoId: embudo.id, nombre: "Nuevo paciente", orden: 1 } });
  if (!await tx.oportunidad.findFirst({ where: { contactoId: contacto.id, titulo: "Consulta Ana García" } })) await tx.oportunidad.create({ data: { contactoId: contacto.id, embudoId: embudo.id, etapaId: etapa.id, titulo: "Consulta Ana García", valor: 900 } });
  const inicio = new Date(); inicio.setDate(inicio.getDate() + 1); inicio.setHours(16, 0, 0, 0); const fin = new Date(inicio.getTime() + 45 * 60000);
  const cita = await tx.cita.findFirst({ where: { contactoId: contacto.id, titulo: "Consulta de valoración" } }); if (!cita) await tx.cita.create({ data: { contactoId: contacto.id, responsableId: admin.id, titulo: "Consulta de valoración", inicio, fin, estado: "confirmada" } });
});
console.log("Demo lista: /login?org=demo-clinica", email);
await prisma.$disconnect();
