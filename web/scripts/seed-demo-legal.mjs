import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const [email, password] = process.argv.slice(2);
if (!email || !password) throw new Error("Uso: node scripts/seed-demo-legal.mjs <email> <contraseña>");
const prisma = new PrismaClient();
const org = await prisma.org.upsert({
  where: { slug: "demo-legal" },
  update: { nombre: "Demo Legal Ámbar", activo: true },
  create: { slug: "demo-legal", nombre: "Demo Legal Ámbar" },
});

await prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe("SELECT set_config('app.current_org', $1, true)", String(org.id));
  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await tx.usuario.upsert({
    where: { orgId_email: { orgId: org.id, email } },
    update: { passwordHash, activo: true, puesto: "Abogado", rol: "admin" },
    create: { nombre: "Lic. Andrea Campos", email, passwordHash, puesto: "Abogado", rol: "admin" },
  });
  await tx.ajustes.upsert({
    where: { orgId: org.id },
    update: { marcaNombre: "Demo Legal Ámbar", nombreNegocio: "Demo Legal Ámbar" },
    create: { marcaNombre: "Demo Legal Ámbar", nombreNegocio: "Demo Legal Ámbar" },
  });
  for (const clave of ["legal", "asesorias_legales", "finanzas_legales", "operacion_legal", "citas"]) {
    await tx.moduloOrg.upsert({
      where: { orgId_clave: { orgId: org.id, clave } },
      update: { activo: true },
      create: { clave, activo: true, config: {} },
    });
  }
  const sucursal = await tx.sucursalLegal.upsert({
    where: { orgId_nombre: { orgId: org.id, nombre: "Oficina Centro" } },
    update: { activa: true },
    create: { nombre: "Oficina Centro", direccion: "Dirección de ejemplo" },
  });
  const contactos = [];
  for (const [nombre, telefono] of [
    ["Mariana Ejemplo", "5558100001"],
    ["Carlos Demostración", "5558100002"],
    ["Sofía Muestra", "5558100003"],
  ]) {
    contactos.push(await tx.contacto.upsert({
      where: { orgId_telefono: { orgId: org.id, telefono } },
      update: { nombre },
      create: { nombre, telefono, fuente: "manual", responsableId: admin.id },
    }));
  }
  for (const [indice, datos] of [
    [0, {
      numeroInterno: "DEMO-FAM-001",
      materia: "Familiar",
      tipoJuicio: "Convenio",
      etapaProcesal: "Integración",
      resumen: "Asunto completamente ficticio para mostrar el módulo.",
    }],
    [1, {
      numeroInterno: "DEMO-MER-002",
      materia: "Mercantil",
      tipoJuicio: "Cobranza",
      etapaProcesal: "Seguimiento",
      resumen: "Segundo expediente demostrativo sin información real.",
    }],
  ]) {
    let expediente = await tx.expedienteLegal.findFirst({
      where: { numeroInterno: datos.numeroInterno },
    });
    if (!expediente) expediente = await tx.expedienteLegal.create({
      data: {
        ...datos,
        contactoId: contactos[indice].id,
        responsableId: admin.id,
        sucursalId: sucursal.id,
      },
    });
    if (await tx.registroExpedienteLegal.count({ where: { expedienteId: expediente.id } }) === 0) {
      await tx.registroExpedienteLegal.createMany({
        data: [
          {
            expedienteId: expediente.id,
            usuarioId: admin.id,
            tipo: "actuacion",
            titulo: "Revisión inicial",
            descripcion: "Registro ficticio de demostración.",
            fechaInicio: new Date(),
          },
          {
            expedienteId: expediente.id,
            usuarioId: admin.id,
            tipo: "seguimiento",
            titulo: "Llamada de seguimiento",
            descripcion: "Se acordó continuar la próxima semana.",
            fechaInicio: new Date(),
          },
        ],
      });
    }
  }
  if (await tx.asesoriaLegal.count() === 0) {
    await tx.asesoriaLegal.createMany({ data: contactos.slice(1).map((contacto, indice) => ({
      contactoId: contacto.id, abogadoId: admin.id, sucursalId: sucursal.id,
      fecha: new Date(), tema: indice ? "Consulta civil de ejemplo" : "Consulta familiar de ejemplo",
      estado: indice ? "pendiente" : "contrato_firmado", monto: 900,
    })) });
  }
}, { timeout: 60_000 });

console.log("demo legal ficticia lista: /login?org=demo-legal");
await prisma.$disconnect();
