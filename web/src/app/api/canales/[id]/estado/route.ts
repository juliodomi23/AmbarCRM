import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { getProvider } from "@/lib/channel";
import { instanciaPorDefecto } from "@/lib/channel/evolution";

export const dynamic = "force-dynamic";

/**
 * Consulta el estado real de la conexión contra el proveedor y lo sincroniza en la BD.
 * La UI lo llama en bucle mientras se muestra el QR.
 */
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await requireSesion();
  if ("error" in s) return s.error;

  const canal = await db.canalWhatsapp.findUnique({ where: { id: BigInt(params.id) } });
  if (!canal) return NextResponse.json({ error: "canal inexistente" }, { status: 404 });

  const provider = getProvider(canal.proveedor);
  if (!provider.estadoConexion) {
    return NextResponse.json({ estado: canal.estado, soportaQR: false });
  }

  const instancia = canal.instancia?.trim() || instanciaPorDefecto;
  const { estado, telefono } = await provider.estadoConexion(instancia);

  const estadoBD = estado === "conectado" ? "conectado" : "desconectado";
  if (estadoBD !== canal.estado) {
    await db.canalWhatsapp.update({ where: { id: canal.id }, data: { estado: estadoBD } });
  }

  return NextResponse.json({ estado, telefono, soportaQR: true });
}
