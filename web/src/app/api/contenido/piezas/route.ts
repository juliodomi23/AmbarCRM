import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { aBigInt } from "@/lib/ids";
import { referenciaPropia } from "@/lib/referencias";
import { texto } from "@/lib/despacho-api";
import {
  CANALES_CONTENIDO, ESTADOS_CONTENIDO, FORMATOS_CONTENIDO, semanaDe, validarEnlaceMaterial,
} from "@/lib/contenido";
import { revisorPorDefecto, esSoloRevisorContenido } from "@/lib/contenido-datos";

async function nombresUsuarios(ids: (bigint | null)[]) {
  const limpios = [...new Set(ids.filter((id): id is bigint => id !== null).map(String))].map(BigInt);
  if (!limpios.length) return new Map<string, string>();
  const usuarios = await db.usuario.findMany({ where: { id: { in: limpios } }, select: { id: true, nombre: true } });
  return new Map(usuarios.map((usuario) => [String(usuario.id), usuario.nombre]));
}

export const GET = conModulo("contenido", {}, async (sesion, req: NextRequest) => {
  const params = req.nextUrl.searchParams;
  const where: Prisma.ContenidoPiezaWhereInput = {};
  const estado = params.get("estado");
  const canal = params.get("canal");
  const campanaId = aBigInt(params.get("campanaId"));
  const contactoId = aBigInt(params.get("contactoId"));
  const revisorId = aBigInt(params.get("revisorId"));
  const redactorId = aBigInt(params.get("redactorId"));
  if (estado && ESTADOS_CONTENIDO.includes(estado as (typeof ESTADOS_CONTENIDO)[number])) where.estado = estado;
  if (canal && CANALES_CONTENIDO.includes(canal as (typeof CANALES_CONTENIDO)[number])) where.canal = canal;
  if (campanaId) where.campanaId = campanaId;
  if (contactoId) where.contactoId = contactoId;
  if (revisorId) where.revisorId = revisorId;
  if (redactorId) where.redactorId = redactorId;
  if (esSoloRevisorContenido(sesion) && sesion.userId != null) where.revisorId = sesion.userId;
  const semana = params.get("semana");
  if (semana && /^\d{4}-\d{2}-\d{2}$/.test(semana)) {
    const { inicio, fin } = semanaDe(semana);
    where.fechaPublicacion = { gte: new Date(`${inicio}T00:00:00.000-06:00`), lte: new Date(`${fin}T23:59:59.999-06:00`) };
  }
  const piezas = await db.contenidoPieza.findMany({
    where,
    include: { comentarios: { orderBy: { creadoAt: "desc" }, take: 3 }, _count: { select: { comentarios: true } } },
    orderBy: [{ fechaPublicacion: "asc" }, { updatedAt: "desc" }],
    take: 500,
  });
  const nombres = await nombresUsuarios(piezas.flatMap((pieza) => [pieza.redactorId, pieza.revisorId]));
  const conNombres = piezas.map((pieza) => ({
    ...pieza,
    redactorNombre: pieza.redactorId ? nombres.get(String(pieza.redactorId)) ?? null : null,
    revisorNombre: pieza.revisorId ? nombres.get(String(pieza.revisorId)) ?? null : null,
  }));
  return NextResponse.json(serializar({ piezas: conNombres }));
});

export const POST = conModulo("contenido", {}, async (sesion, req: NextRequest) => {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Datos de la pieza inválidos" }, { status: 400 });
  }
  const titulo = texto(body.titulo).slice(0, 200);
  const canal = texto(body.canal);
  const formato = texto(body.formato) || "texto";
  if (!titulo || !CANALES_CONTENIDO.includes(canal as (typeof CANALES_CONTENIDO)[number])) {
    return NextResponse.json({ error: "Escribe el título y elige un canal válido" }, { status: 400 });
  }
  if (!FORMATOS_CONTENIDO.includes(formato as (typeof FORMATOS_CONTENIDO)[number])) {
    return NextResponse.json({ error: "Formato inválido" }, { status: 400 });
  }
  if (!validarEnlaceMaterial(body.enlaceMaterial)) {
    return NextResponse.json({ error: "El enlace del material debe ser https" }, { status: 400 });
  }
  const campanaId = await referenciaPropia("campana", body.campanaId);
  if (campanaId === false) return NextResponse.json({ error: "La campaña no pertenece a esta organización" }, { status: 400 });
  const contactoId = await referenciaPropia("contacto", body.contactoId);
  if (contactoId === false) return NextResponse.json({ error: "El contacto no pertenece a esta organización" }, { status: 400 });
  const redactorId = await referenciaPropia("usuario", body.redactorId);
  if (redactorId === false) return NextResponse.json({ error: "Redactor no encontrado" }, { status: 400 });
  const revisorId = await referenciaPropia("usuario", body.revisorId);
  if (revisorId === false) return NextResponse.json({ error: "Revisor no encontrado" }, { status: 400 });
  const redactorFinal = redactorId ?? sesion.userId ?? null;
  const revisorFinal = revisorId ?? (redactorFinal != null ? await revisorPorDefecto(redactorFinal) : null);
  let fechaPublicacion: Date | null = null;
  if (body.fechaPublicacion) {
    fechaPublicacion = new Date(String(body.fechaPublicacion));
    if (Number.isNaN(fechaPublicacion.getTime())) return NextResponse.json({ error: "Fecha de publicación inválida" }, { status: 400 });
  }
  const pieza = await db.contenidoPieza.create({
    data: {
      titulo,
      copy: texto(body.copy).slice(0, 10000),
      canal,
      formato,
      campanaId,
      contactoId,
      redactorId: redactorFinal,
      revisorId: revisorFinal,
      fechaPublicacion,
      enlaceMaterial: texto(body.enlaceMaterial) || null,
      notasDiseno: texto(body.notasDiseno).slice(0, 2000) || null,
    },
  });
  return NextResponse.json(serializar({ pieza }), { status: 201 });
});
