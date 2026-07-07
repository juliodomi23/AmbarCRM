import { NextRequest, NextResponse } from "next/server";
import { requireSesion } from "@/lib/session";
import { listarConversaciones, buscarEnMensajes } from "@/lib/services/chat";
import { serializar } from "@/lib/serialize";

export const dynamic = "force-dynamic";

function mapearConv(c: any) {
  return {
    id: c.id,
    contacto: { nombre: c.contacto.nombre, telefono: c.contacto.telefono },
    esPersonal: c.contacto.esPersonal ?? false,
    fijado: !!c.fijadoAt,
    responsableId: c.responsable?.id ?? null,
    noLeidos: c.noLeidos,
    ultimoMensajeAt: c.ultimoMensajeAt,
    preview: c.mensajes[0]?.contenido ?? (c.mensajes[0] ? `[${c.mensajes[0].tipo}]` : ""),
    estado: c.estado,
    etiquetas: c.etiquetas ?? []
  };
}

/** Lista de conversaciones para la bandeja. ?q=texto busca en contenido de mensajes. */
export async function GET(req: NextRequest) {
  const s = await requireSesion();
  if ("error" in s) return s.error;

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (q.length >= 2) {
    const raw = serializar(await buscarEnMensajes(q));
    return NextResponse.json({ conversaciones: raw.map(mapearConv), esBusqueda: true });
  }

  const convs = serializar(await listarConversaciones());
  return NextResponse.json({ conversaciones: convs.map(mapearConv) });
}
