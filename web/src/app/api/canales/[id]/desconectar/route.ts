import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { getProvider } from "@/lib/channel";
import { instanciaPorDefecto } from "@/lib/channel/evolution";

export const dynamic = "force-dynamic";

/**
 * Cierra la sesión del número vinculado y marca el canal como desconectado.
 * Body opcional: { borrarDatos: true } borra contactos, chats y grupos de la org
 * (cascada: conversaciones, mensajes, oportunidades, etiquetas de contacto).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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
  let borrados: { contactos: number; grupos: number } | undefined;
  if (body?.borrarDatos === true) {
    // RLS acota a la org de la sesión: solo se borra lo del tenant que desconecta.
    const grupos = await db.grupo.deleteMany({});
    const contactos = await db.contacto.deleteMany({});
    borrados = { contactos: contactos.count, grupos: grupos.count };
  }

  if (!res.ok) return NextResponse.json({ ok: false, error: res.error, borrados }, { status: 502 });
  return NextResponse.json({ ok: true, borrados });
}
