import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getMensajes, marcarLeida } from "@/lib/services/chat";
import { serializar } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** Mensajes de la conversación + la marca como leída. */
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "no autorizado" }, { status: 401 });

  const id = BigInt(params.id);
  const mensajes = await getMensajes(id);
  await marcarLeida(id);

  return NextResponse.json({ mensajes: serializar(mensajes) });
}
