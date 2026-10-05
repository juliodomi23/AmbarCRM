// Crea datos idempotentes para la revisión de Meta.
// Uso: node scripts/seed-meta-review.mjs correo contraseña [nombre]
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const [, , email, pass, nombre = "Revisor Meta"] = process.argv;
if (!email || !pass) {
  console.error('Uso: node scripts/seed-meta-review.mjs correo "contraseña" [nombre]');
  process.exit(1);
}
if (!email.includes("@") || pass.length < 12) {
  console.error("Usa un correo válido y una contraseña de al menos 12 caracteres.");
  process.exit(1);
}

const db = new PrismaClient();

try {
  const org = await db.org.upsert({
    where: { slug: "demo-meta" },
    update: { nombre: "Demo Meta", activo: true },
    create: { slug: "demo-meta", nombre: "Demo Meta" }
  });
  const passwordHash = await bcrypt.hash(pass, 10);

  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_org', ${org.id.toString()}, true)`;

    const admin = await tx.usuario.upsert({
      where: { orgId_email: { orgId: org.id, email } },
      update: { nombre, passwordHash, rol: "admin", activo: true },
      create: { orgId: org.id, nombre, email, passwordHash, rol: "admin", activo: true }
    });

    const ejemplos = [
      {
        nombre: "Ana Martínez",
        telefono: "5215500000001",
        empresa: "Comercial del Centro",
        mensajes: [
          ["entrante", "Hola, quisiera conocer sus servicios."],
          ["saliente", "¡Hola, Ana! Con gusto te compartimos la información."]
        ]
      },
      {
        nombre: "Carlos Ramírez",
        telefono: "5215500000002",
        empresa: "Servicios del Norte",
        mensajes: [
          ["entrante", "¿Podemos agendar una demostración para mañana?"],
          ["saliente", "Claro. Un asesor confirmará el horario contigo."]
        ]
      },
      {
        nombre: "Sofía Hernández",
        telefono: "5215500000003",
        empresa: "Tienda Ejemplo",
        mensajes: [["entrante", "Gracias, ya recibí la propuesta."]]
      }
    ];

    for (const [contactIndex, ejemplo] of ejemplos.entries()) {
      const contacto = await tx.contacto.upsert({
        where: { orgId_telefono: { orgId: org.id, telefono: ejemplo.telefono } },
        update: { nombre: ejemplo.nombre, empresa: ejemplo.empresa, responsableId: admin.id },
        create: {
          orgId: org.id,
          nombre: ejemplo.nombre,
          telefono: ejemplo.telefono,
          empresa: ejemplo.empresa,
          fuente: "whatsapp",
          responsableId: admin.id
        }
      });

      let conversacion = await tx.conversacion.findFirst({
        where: { contactoId: contacto.id, canalId: null }
      });
      if (!conversacion) {
        conversacion = await tx.conversacion.create({
          data: {
            orgId: org.id,
            contactoId: contacto.id,
            responsableId: admin.id,
            botActivo: false,
            noLeidos: contactIndex === 2 ? 1 : 0
          }
        });
      }

      for (const [messageIndex, [direccion, contenido]] of ejemplo.mensajes.entries()) {
        const waMessageId = `demo-meta-${contactIndex + 1}-${messageIndex + 1}`;
        await tx.mensaje.upsert({
          where: { waMessageId },
          update: { contenido, direccion, enviadoPor: direccion === "saliente" ? admin.id : null },
          create: {
            orgId: org.id,
            conversacionId: conversacion.id,
            direccion,
            tipo: "texto",
            contenido,
            status: direccion === "saliente" ? "leido" : "entregado",
            waMessageId,
            enviadoPor: direccion === "saliente" ? admin.id : null,
            timestamp: new Date(Date.now() - (10 - messageIndex) * 60_000)
          }
        });
      }

      await tx.conversacion.update({
        where: { id: conversacion.id },
        data: { ultimoMensajeAt: new Date(Date.now() - contactIndex * 60 * 60_000) }
      });
    }
  });

  console.log(`Demo de Meta lista: organización demo-meta, usuario ${email}.`);
} finally {
  await db.$disconnect();
}
