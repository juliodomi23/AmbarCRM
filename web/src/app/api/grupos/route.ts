import { NextRequest, NextResponse } from "next/server";
import { requireSesion } from "@/lib/session";
import { listarGrupos } from "@/lib/services/grupos";
import { serializar } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** Lista de grupos para la bandeja de grupos. */
export async function GET(_req: NextRequest) {
  const s = await requireSesion();
  if ("error" in s) return s.error;

  const grupos = serializar(await listarGrupos()).map((g: any) => ({
    id: g.id,
    nombre: g.nombre,
    noLeidos: g.noLeidos,
    ultimoMensajeAt: g.ultimoMensajeAt,
    preview: g.mensajes[0]?.contenido ?? (g.mensajes[0] ? "[archivo]" : "")
  }));
  return NextResponse.json({ grupos });
}
