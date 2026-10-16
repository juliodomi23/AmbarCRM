import { NextRequest, NextResponse } from "next/server";
import { conCanalApi } from "@/lib/canal-api-auth";
import { ingestarEntrante } from "@/lib/services/ingest";
import type { TipoMensaje } from "@/lib/channel";

export const dynamic = "force-dynamic";
const TIPOS: TipoMensaje[] = ["texto", "imagen", "audio", "video", "documento", "ubicacion"];
const cadena = (valor: unknown, max: number): valor is string => typeof valor === "string" && valor.trim().length > 0 && valor.length <= max;

export async function POST(req: NextRequest, props: { params: Promise<{ canalId: string }> }) {
  const { canalId } = await props.params;
  return conCanalApi(req, canalId, async (id) => {
    const raw = await req.text();
    if (Buffer.byteLength(raw) > 100_000) return NextResponse.json({ error: "mensaje demasiado grande" }, { status: 413 });
    let body;
    try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
    const contacto = body?.contacto;
    const mensaje = body?.mensaje;
    const timestamp = body?.timestamp == null ? new Date() : new Date(body.timestamp);
    if (!cadena(contacto?.id_externo, 255) || !cadena(mensaje?.id, 255) || !TIPOS.includes(mensaje?.tipo)
      || (contacto.nombre != null && !cadena(contacto.nombre, 255))
      || (contacto.telefono != null && (typeof contacto.telefono !== "string" || !/^\+?\d{7,15}$/.test(contacto.telefono)))
      || (mensaje.contenido != null && !cadena(mensaje.contenido, 20_000))
      || !Number.isFinite(timestamp.getTime()) || timestamp.getTime() > Date.now() + 60_000) {
      return NextResponse.json({ error: "contacto, mensaje o timestamp inválidos" }, { status: 400 });
    }
    if (mensaje.tipo === "texto" ? !mensaje.contenido : mensaje.tipo !== "ubicacion" && !cadena(mensaje.media_url, 2048)) {
      return NextResponse.json({ error: "falta contenido o media_url" }, { status: 400 });
    }
    if (mensaje.media_url != null) {
      try { if (new URL(mensaje.media_url).protocol !== "https:") throw new Error(); }
      catch { return NextResponse.json({ error: "media_url debe ser una URL https" }, { status: 400 }); }
    }
    const resultado = await ingestarEntrante({
      identificadorExterno: contacto.id_externo, nombre: contacto.nombre,
      telefono: contacto.telefono?.replace(/^\+/, ""),
      waMessageId: mensaje.id, tipo: mensaje.tipo, contenido: mensaje.contenido,
      mediaUrl: mensaje.media_url, timestamp,
    }, id);
    return NextResponse.json({ ok: true, ...resultado, mensajeId: String(resultado.mensajeId),
      conversacionId: "conversacionId" in resultado ? String(resultado.conversacionId) : undefined });
  });
}
