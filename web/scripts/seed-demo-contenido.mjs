// Uso opcional: ALLOW_DEMO_SEED=1 node scripts/seed-demo-contenido.mjs correo contraseña
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { credencialesDemo, imprimirCredencialesDemo } from "./lib/demo-seed.mjs";

const { email, password, passwordGenerada } = credencialesDemo("refmex@local.test");
const prisma = new PrismaClient();
const SLUG = process.env.ORG_SLUG || "refmex";

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
  fecha.setUTCHours(hora + 6, 0, 0, 0);
  return fecha;
}

const org = await prisma.org.upsert({
  where: { slug: SLUG },
  update: { nombre: "REFMEX", activo: true },
  create: { nombre: "REFMEX", slug: SLUG },
});

const PIEZAS = [
  ["Calendario fiscal de noviembre", "instagram", "carrusel", "aprobado", 0, 9],
  ["CFDI 4.0: lo que debes revisar", "facebook", "imagen", "programado", 1, 13],
  ["Nómina: errores que cuestan multas", "instagram", "reel", "publicado", 1, 18],
  ["REPSE: renueva a tiempo", "linkedin", "imagen", "revision", 2, 9],
  ["Auditoría: no es solo para grandes", "facebook", "carrusel", "cambios", 2, 13],
  ["Planeación fiscal 2026", "instagram", "carrusel", "redaccion", 3, 9],
  ["Compliance laboral en 5 pasos", "linkedin", "articulo", "idea", 3, 13],
  ["Cartas invitación del SAT: qué hacer", "tiktok", "video", "aprobado", 4, 18],
  ["Estados financieros claros para decidir", "facebook", "imagen", "publicado", 4, 13],
  ["Precios de transferencia: cuándo aplica", "linkedin", "imagen", "programado", 5, 9],
  ["Defensa fiscal preventiva", "instagram", "reel", "idea", 6, 9],
  ["REFMEX: 3 oficinas, una red fiscal", "instagram", "carrusel", "revision", 6, 18],
];

const COPIES = {
  "Calendario fiscal de noviembre": "Estas son las fechas clave del mes para personas físicas y empresas. Comparte y evita recargos.",
  "CFDI 4.0: lo que debes revisar": "Datos fiscales, régimen y uso del CFDI: tres puntos que deben coincidir antes de timbrar.",
  "Nómina: errores que cuestan multas": "Errores frecuentes en nómina y cómo evitarlos antes de que llegue una revisión.",
  "REPSE: renueva a tiempo": "El REPSE no es un trámite de una sola vez. Revisa vigencias y documentación.",
  "Auditoría: no es solo para grandes": "Una auditoría preventiva ordena la información y detecta riesgos antes de que crezcan.",
  "Planeación fiscal 2026": "La mejor estrategia fiscal empieza con decisiones, no con prisas de último día.",
  "Compliance laboral en 5 pasos": "Del expediente a la seguridad social: cinco revisiones para mantener tu operación en orden.",
  "Cartas invitación del SAT: qué hacer": "Recibir una carta invitación no es una sentencia. Te explicamos cómo atenderla.",
  "Estados financieros claros para decidir": "Números claros = mejores decisiones. Así debe leerlos tu equipo directivo.",
  "Precios de transferencia: cuándo aplica": "Operaciones entre partes relacionadas: qué documentación conviene tener lista.",
  "Defensa fiscal preventiva": "Prevenir es más barato que corregir. Revisa tu situación antes de una auditoría.",
  "REFMEX: 3 oficinas, una red fiscal": "Tuxtla Gutiérrez, Monterrey y Tultitlán: un mismo estándar de servicio fiscal y contable.",
};

await prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe("SELECT set_config('app.current_org', $1, true)", String(org.id));
  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await tx.usuario.upsert({
    where: { orgId_email: { orgId: org.id, email } },
    update: { nombre: "Dirección REFMEX", passwordHash, rol: "admin", puesto: "Administrador", activo: true },
    create: { nombre: "Dirección REFMEX", email, passwordHash, rol: "admin", puesto: "Administrador" },
  });
  const equipo = [];
  for (const [nombre, correo, puesto] of [
    ["Valeria Ortiz", "valeria@refmex.demo", "Mercadotecnia"],
    ["Emilio Cárdenas", "emilio@refmex.demo", "Dirección comercial"],
    ["Renata Silva", "renata@refmex.demo", "Mercadotecnia"],
  ]) {
    equipo.push(await tx.usuario.upsert({
      where: { orgId_email: { orgId: org.id, email: correo } },
      update: { nombre, puesto, activo: true },
      create: { nombre, email: correo, passwordHash, rol: "agente", puesto },
    }));
  }
  const [valeria, emilio, renata] = equipo;
  await tx.ajustes.upsert({
    where: { orgId: org.id },
    update: { marcaNombre: "REFMEX", marcaColorPrimario: "#0F2341", marcaColorAcento: "#2563EB", marcaPreset: "legal" },
    create: { marcaNombre: "REFMEX", marcaColorPrimario: "#0F2341", marcaColorAcento: "#2563EB", marcaPreset: "legal" },
  });
  for (const clave of ["contenido", "clientes"]) {
    await tx.moduloOrg.upsert({ where: { orgId_clave: { orgId: org.id, clave } }, update: { activo: true }, create: { clave, activo: true, config: {} } });
  }

  const campanas = [];
  for (const [nombre, objetivo, canal] of [
    ["Calendario fiscal", "reconocimiento", "instagram"],
    ["Confianza fiscal", "ventas", "facebook"],
    ["Servicios REFMEX", "reconocimiento", "instagram"],
  ]) {
    const existente = await tx.campanaMarketing.findFirst({ where: { nombre } });
    campanas.push(existente ?? await tx.campanaMarketing.create({
      data: { nombre, tipo: "marketing", objetivo, canal, estado: "borrador" },
    }));
  }

  const contactos = [];
  for (const [nombre, telefono] of [["Laura Méndez", "5558000001"], ["Carlos Rivas", "5558000002"], ["Ana Torres", "5558000003"]]) {
    contactos.push(await tx.contacto.upsert({
      where: { orgId_telefono: { orgId: org.id, telefono } },
      update: { nombre },
      create: { nombre, telefono, fuente: "manual" },
    }));
  }

  for (const [indice, [titulo, canal, formato, estado, dia, hora]] of PIEZAS.entries()) {
    const redactor = [valeria, renata][indice % 2];
    const revisor = emilio;
    const datosPieza = {
        titulo,
        canal,
        formato,
        copy: COPIES[titulo] ?? `${titulo}. Contenido de demostración para redes sociales.`,
        notasDiseno: "Usar la paleta azul de REFMEX y tipografía institucional.",
        estado,
        redactorId: redactor.id,
        revisorId: revisor.id,
        campanaId: campanas[indice % campanas.length].id,
        contactoId: contactos[indice % contactos.length].id,
        fechaPublicacion: diaDeLaSemana(dia, hora),
        publicadaAt: estado === "publicado" ? diaDeLaSemana(dia, hora) : null,
        enlaceMaterial: indice % 3 === 0 ? "https://example.com/material-demo" : null,
        version: 1,
      };
    const existente = await tx.contenidoPieza.findFirst({ where: { titulo }, select: { id: true } });
    const pieza = existente
      ? await tx.contenidoPieza.update({ where: { id: existente.id }, data: datosPieza })
      : await tx.contenidoPieza.create({ data: datosPieza });
    await tx.contenidoCambio.deleteMany({ where: { piezaId: pieza.id } });
    await tx.contenidoComentario.deleteMany({ where: { piezaId: pieza.id } });
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

imprimirCredencialesDemo({ nombre: "REFMEX", slug: SLUG, email, password, passwordGenerada });
await prisma.$disconnect();
