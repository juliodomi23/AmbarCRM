import { deflateRawSync, inflateRawSync } from "node:zlib";
import { EstadoConv } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { buscarEnMensajes, etiquetasDeContacto } from "@/lib/services/chat";

export const dynamic = "force-dynamic";

type Cursor = { v: 1; ids: string[]; pos: number; estado: string | null };
const cache = { "Cache-Control": "no-store" };

function codificarCursor(cursor: Cursor) {
  return deflateRawSync(JSON.stringify(cursor)).toString("base64url");
}

function leerCursor(texto: string): Cursor | null {
  if (texto.length > 1_000_000) return null;
  try {
    const valor = JSON.parse(inflateRawSync(Buffer.from(texto, "base64url"), {
      maxOutputLength: 4_000_000,
    }).toString()) as Cursor;
    if (valor.v !== 1 || !Array.isArray(valor.ids) || !Number.isSafeInteger(valor.pos)
      || valor.pos < 0 || valor.pos > valor.ids.length
      || !valor.ids.every((id) => typeof id === "string" && /^\d+$/.test(id))) return null;
    return valor;
  } catch {
    return null;
  }
}

function mapearConv(c: any) {
  return {
    id: String(c.id),
    contacto: { id: String(c.contacto.id), nombre: c.contacto.nombre, telefono: c.contacto.telefono },
    esPersonal: c.contacto.esPersonal ?? false,
    fijado: !!c.fijadoAt,
    responsableId: c.responsableId ? String(c.responsableId) : null,
    noLeidos: c.noLeidos,
    ultimoMensajeAt: c.ultimoMensajeAt?.toISOString() ?? null,
    preview: c.mensajes[0]?.contenido ?? (c.mensajes[0] ? `[${c.mensajes[0].tipo}]` : ""),
    estado: c.estado,
    etiquetas: etiquetasDeContacto(c.contacto),
    canalId: c.canal?.id ? String(c.canal.id) : null,
    canalNombre: c.canal?.nombre ?? "Sin canal",
    canalProveedor: c.canal?.proveedor ?? null,
    ultimoEntranteAt: c.ultimoEntranteAt?.toISOString() ?? null,
    canalActivo: c.canal?.activo ?? true,
    botActivo: c.botActivo,
    updatedAt: c.updatedAt.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;

  const estadoTexto = req.nextUrl.searchParams.get("estado");
  if (estadoTexto !== null && !["abierta", "pendiente", "cerrada"].includes(estadoTexto)) {
    return NextResponse.json({ error: "estado inválido" }, { status: 400, headers: cache });
  }
  const estado = estadoTexto as EstadoConv | null;
  const solicitado = Number(req.nextUrl.searchParams.get("limite"));
  const limite = Number.isInteger(solicitado) && solicitado > 0 ? Math.min(solicitado, 100) : 50;
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  const cursorTexto = req.nextUrl.searchParams.get("cursor");

  if (q.length >= 2) {
    if (cursorTexto) return NextResponse.json({ error: "cursor no disponible en búsqueda" }, { status: 400, headers: cache });
    const resultados = await buscarEnMensajes(q);
    return NextResponse.json({
      conversaciones: resultados.filter((c) => !estado || c.estado === estado).map(mapearConv),
      siguiente: null,
    }, { headers: cache });
  }

  let cursor = cursorTexto ? leerCursor(cursorTexto) : null;
  if (cursorTexto && (!cursor || cursor.estado !== estado)) {
    return NextResponse.json({ error: "cursor inválido" }, { status: 400, headers: cache });
  }
  if (!cursor) {
    const lista = await db.conversacion.findMany({
      where: estado ? { estado } : undefined,
      orderBy: [
        { fijadoAt: { sort: "desc", nulls: "last" } },
        { ultimoMensajeAt: "desc" },
        { id: "desc" },
      ],
      select: { id: true },
    });
    cursor = { v: 1, ids: lista.map((c) => String(c.id)), pos: 0, estado };
  }

  const ids = cursor.ids.slice(cursor.pos, cursor.pos + limite).map(BigInt);
  const filas = ids.length ? await db.conversacion.findMany({
    where: { id: { in: ids }, ...(estado ? { estado } : {}) },
    include: {
      contacto: { include: { etiquetas: { select: { etiqueta: { select: { nombre: true } } } } } },
      canal: true,
      mensajes: { orderBy: { timestamp: "desc" }, take: 1 },
    },
  }) : [];
  const porId = new Map(filas.map((c) => [String(c.id), c]));
  const siguientePos = cursor.pos + ids.length;
  return NextResponse.json({
    conversaciones: ids.flatMap((id) => {
      const fila = porId.get(String(id));
      return fila ? [mapearConv(fila)] : [];
    }),
    siguiente: siguientePos < cursor.ids.length
      ? codificarCursor({ ...cursor, pos: siguientePos }) : null,
  }, { headers: cache });
}
