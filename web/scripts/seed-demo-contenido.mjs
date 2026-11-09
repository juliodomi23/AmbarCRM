// Uso opcional: ALLOW_DEMO_SEED=1 node scripts/seed-demo-contenido.mjs correo contraseña
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { credencialesDemo, imprimirCredencialesDemo } from "./lib/demo-seed.mjs";

const { email, password, passwordGenerada } = credencialesDemo("contenido@local.test");
const prisma = new PrismaClient();
const SLUG = process.env.ORG_SLUG || "demo-contenido";

function lunesDeLaSemana() {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [anio, mes, dia] = partes.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  const desplazamiento = (fecha.getUTCDay() + 6) % 7;
  fecha.setUTCDate(fecha.getUTCDate() - desplazamiento);
  return fecha;
}
function diaDeLaSemana(dia, hora) {
  const fecha = new Date(lunesDeLaSemana());
  fecha.setUTCDate(fecha.getUTCDate() + dia);
  fecha.setUTCHours(hora, 0, 0, 0);
  return fecha;
}

const org = await prisma.org.upsert({
  where: { slug: SLUG },
  update: { nombre: "Estudio Ámbar Creativo", activo: true },
  create: { nombre: "Estudio Ámbar Creativo", slug: SLUG },
});

const PIEZAS = [
  ["Lanzamiento de temporada", "instagram", "carrusel", "aprobado", 0, 9],
  ["Tips para cuidar tu piel", "instagram", "reel", "programado", 1, 11],
  ["Testimonio de cliente", "facebook", "imagen", "publicado", 1, 8],
  ["Detrás de cámaras", "tiktok", "video", "revision", 2, 10],
  ["Promoción de fin de semana", "instagram", "historia", "cambios", 2, 13],
  ["Nuevo producto: set de regalo", "facebook", "carrusel", "redaccion", 3, 9],
  ["Preguntas frecuentes", "instagram", "reel", "idea", 3, 15],
  ["Testimonio de cliente", "tiktok", "video", "aprobado", 4, 12],
  ["Guía de tallas", "facebook", "imagen", "publicado", 4, 10],
  ["Bienvenida al newsletter", "instagram", "imagen", "programado", 5, 9],
  ["Resumen de la semana", "facebook", "imagen", "idea", 6, 11],
  ["Sorteo de aniversario", "instagram", "carrusel", "revision", 6, 17],
];

await prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe("SELECT set_config('app.current_org', $1, true)", String(org.id));
  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await tx.usuario.upsert({
    where: { orgId_email: { orgId: org.id, email } },
    update: { nombre: "Dirección creativa", passwordHash, rol: "admin", puesto: "Administrador", activo: true },
    create: { nombre: "Dirección creativa", email, passwordHash, rol: "admin", puesto: "Administrador" },
  });
  const equipo = [];
  for (const [nombre, correo, puesto] of [
    ["Valeria Ortiz", "valeria@ambar-creativo.demo", "Mercadotecnia"],
    ["Emilio Cárdenas", "emilio@ambar-creativo.demo", "Dirección comercial"],
    ["Renata Silva", "renata@ambar-creativo.demo", "Mercadotecnia"],
  ]) {
    equipo.push(await tx.usuario.upsert({
      where: { orgId_email: { orgId: org.id, email: correo } },
      update: { nombre, puesto, activo: true },
      create: { nombre, email: correo, passwordHash, rol: "agente", puesto },
    }));
  }
  const [valeria, emilio, renata] = equipo;
  await tx.ajustes.upsert({ where: { orgId: org.id }, update: { marcaNombre: "Ámbar Creativo" }, create: { marcaNombre: "Ámbar Creativo" } });
  for (const clave of ["contenido", "clientes"]) {
    await tx.moduloOrg.upsert({ where: { orgId_clave: { orgId: org.id, clave } }, update: { activo: true }, create: { clave, activo: true, config: {} } });
  }

  await tx.contenidoCambio.deleteMany({});
  await tx.contenidoComentario.deleteMany({});
  await tx.contenidoPieza.deleteMany({});

  const campanas = [];
  for (const [nombre, objetivo, canal] of [
    ["Temporada primavera", "reconocimiento", "instagram"],
    ["Fidelización de clientes", "ventas", "facebook"],
  ]) {
    const existente = await tx.campanaMarketing.findFirst({ where: { nombre } });
    campanas.push(existente ?? await tx.campanaMarketing.create({
      data: { nombre, tipo: "marketing", objetivo, canal, estado: "borrador" },
    }));
  }

  const contactos = [];
  for (const [nombre, telefono] of [["Marisol Peña", "5558000001"], ["Diego Fuentes", "5558000002"], ["Camila Rojas", "5558000003"]]) {
    contactos.push(await tx.contacto.upsert({
      where: { orgId_telefono: { orgId: org.id, telefono } },
      update: { nombre },
      create: { nombre, telefono, fuente: "manual" },
    }));
  }

  for (const [indice, [titulo, canal, formato, estado, dia, hora]] of PIEZAS.entries()) {
    const redactor = [valeria, renata][indice % 2];
    const revisor = emilio;
    const pieza = await tx.contenidoPieza.create({
      data: {
        titulo,
        canal,
        formato,
        copy: `${titulo}. Texto de demostración para redes sociales.`,
        notasDiseno: "Usar la paleta de marca y tipografía principal.",
        estado,
        redactorId: redactor.id,
        revisorId: revisor.id,
        campanaId: campanas[indice % campanas.length].id,
        contactoId: contactos[indice % contactos.length].id,
        fechaPublicacion: diaDeLaSemana(dia, hora),
        publicadaAt: estado === "publicado" ? diaDeLaSemana(dia, hora) : null,
        enlaceMaterial: indice % 3 === 0 ? "https://example.com/material-demo" : null,
      },
    });
    await tx.contenidoCambio.create({ data: { piezaId: pieza.id, estadoAnterior: null, estadoNuevo: "idea", userId: admin.id, nota: "Alta de la pieza" } });
    if (estado !== "idea") {
      await tx.contenidoCambio.create({ data: { piezaId: pieza.id, estadoAnterior: "idea", estadoNuevo: estado, userId: redactor.id, nota: "Cambio de estado en la demo" } });
    }
    if (estado === "revision" || estado === "cambios") {
      await tx.contenidoComentario.create({ data: { piezaId: pieza.id, usuarioId: revisor.id, texto: "Revisar el llamado a la acción.", tipo: "comentario" } });
    }
    if (estado === "cambios") {
      await tx.contenidoComentario.create({ data: { piezaId: pieza.id, usuarioId: revisor.id, texto: "Ajustar el copy y volver a enviar a revisión.", tipo: "cambio_solicitado" } });
    }
    if (estado === "aprobado" || estado === "programado" || estado === "publicado") {
      await tx.contenidoComentario.create({ data: { piezaId: pieza.id, usuarioId: revisor.id, texto: "Aprobado para publicación.", tipo: "comentario" } });
    }
  }
});

imprimirCredencialesDemo({ nombre: "Estudio Ámbar Creativo", slug: SLUG, email, password, passwordGenerada });
await prisma.$disconnect();
