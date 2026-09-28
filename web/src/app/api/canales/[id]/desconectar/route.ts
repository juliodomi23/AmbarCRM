import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { getProvider } from "@/lib/channel";
import { instanciaPorDefecto } from "@/lib/channel/evolution";

export const dynamic = "force-dynamic";

/**
 * Cierra la sesión del número vinculado y marca el canal como desconectado.
 * Body opcional: { borrarDatos: true } borra los chats y grupos de ESTE canal.
 * Los contactos y oportunidades se conservan para no destruir datos de otros canales.
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await requireSesion(true);
  if ("error" in s) return s.error;

  const canal = await db.canalWhatsapp.findUnique({ where: { id: BigInt(params.id) } });
  if (!canal) return NextResponse.json({ error: "canal inexistente" }, { status: 404 });

  const provider = getProvider(canal.proveedor);
  if (!provider.desconectar) {
    return NextResponse.json({ error: "este proveedor no soporta desconexión por QR" }, { status: 400 });
  }

  const instancia = canal.instancia?.trim() || instanciaPorDefecto;
  const res = await provider.desconectar(instancia);
  await db.canalWhatsapp.update({ where: { id: canal.id }, data: { estado: "desconectado", telefono: null } });

  const body = await req.json().catch(() => ({}));
  let borrados: { conversaciones: number; grupos: number } | undefined;
  if (body?.borrarDatos === true) {
    // RLS acota a la org y el canal acota el borrado: nunca se elimina todo el CRM.
    const conversaciones = await db.conversacion.deleteMany({ where: { canalId: canal.id } });
    const grupos = await db.grupo.deleteMany({ where: { canalId: canal.id } });
    borrados = { conversaciones: conversaciones.count, grupos: grupos.count };
  }

  if (!res.ok) return NextResponse.json({ ok: false, error: res.error, borrados }, { status: 502 });
  return NextResponse.json({ ok: true, borrados });
}
