import { NextRequest, NextResponse } from "next/server";
import { requireSesion } from "@/lib/session";
import { listarConversaciones, buscarEnMensajes, etiquetasDeContacto } from "@/lib/services/chat";
import { serializar } from "@/lib/serialize";
import { TIPOS_CANAL, type TipoCanal } from "@/lib/channel/tipo-canal";

export const dynamic = "force-dynamic";

function mapearConv(c: any) {
  return {
    id: c.id,
    contacto: { id: c.contacto.id, nombre: c.contacto.nombre, telefono: c.contacto.telefono, avatarUrl: c.contacto.avatarUrl },
    esPersonal: c.contacto.esPersonal ?? false,
    fijado: !!c.fijadoAt,
    responsableId: c.responsable?.id ?? null,
    noLeidos: c.noLeidos,
    ultimoMensajeAt: c.ultimoMensajeAt,
    preview: c.mensajes[0]?.contenido ?? (c.mensajes[0] ? `[${c.mensajes[0].tipo}]` : ""),
    estado: c.estado,
    etiquetas: etiquetasDeContacto(c.contacto),
    canalId: c.canal?.id ?? null,
    canalNombre: c.canal?.nombre ?? "Sin canal",
    canalProveedor: c.canal?.proveedor ?? null,
    ultimoEntranteAt: c.ultimoEntranteAt,
    canalActivo: c.canal?.activo ?? true,
    botActivo: c.botActivo
  };
}

/** Lista de conversaciones para la bandeja. ?q=texto busca en contenido de mensajes. */
export async function GET(req: NextRequest) {
  const s = await requireSesion();
  if ("error" in s) return s.error;

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const parametroTipo = req.nextUrl.searchParams.get("tipo");
  const tipo = TIPOS_CANAL.includes(parametroTipo as TipoCanal) ? parametroTipo as TipoCanal : undefined;

  if (q.length >= 2) {
    const raw = serializar(await buscarEnMensajes(q, tipo));
    return NextResponse.json({ conversaciones: raw.map(mapearConv), esBusqueda: true });
  }

  const convs = serializar(await listarConversaciones(tipo));
  return NextResponse.json({ conversaciones: convs.map(mapearConv) });
}
