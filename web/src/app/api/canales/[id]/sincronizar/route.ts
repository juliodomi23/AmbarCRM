import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { META_GRAPH_URL } from "@/lib/meta/config";
import { tokenFromChannelConfig } from "@/lib/meta/credentials";
import { avisoSincronizacion, estadoSincronizacion, reintentarSincronizacion } from "@/lib/meta/coexistencia";
import { conErrores } from "@/lib/errores-api";

export const dynamic = "force-dynamic";

/** Reintenta la sincronización de contactos/historial de Coexistence que Meta rechazó, dentro de las 24 h. */
async function manejarPOST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await requireSesion(true);
  if ("error" in s) return s.error;

  const canal = await db.canalWhatsapp.findUnique({ where: { id: BigInt(params.id) } });
  if (!canal) return NextResponse.json({ error: "canal inexistente" }, { status: 404 });
  const config = (canal.config || {}) as Record<string, unknown>;
  const estado = estadoSincronizacion(config);
  if (!estado) return NextResponse.json({ error: "este número no se conectó por Coexistence" }, { status: 400 });
  if (!estado.pendientes.length) {
    return NextResponse.json({ error: "Meta ya aceptó la sincronización; no se puede pedir otra vez" }, { status: 409 });
  }
  if (!estado.vigente) {
    return NextResponse.json({ error: "pasaron más de 24 h desde la conexión; Meta ya no permite sincronizar" }, { status: 409 });
  }
  const phoneNumberId = typeof config.phoneNumberId === "string" ? config.phoneNumberId : "";
  const token = tokenFromChannelConfig(config);
  if (!phoneNumberId || !token) return NextResponse.json({ error: "canal sin credenciales Meta" }, { status: 400 });

  const sincronizacion = await reintentarSincronizacion(
    META_GRAPH_URL, phoneNumberId, token, config.sincronizacion as any, estado.pendientes
  );
  await db.canalWhatsapp.update({ where: { id: canal.id }, data: { config: { ...config, sincronizacion } } });
  const aviso = avisoSincronizacion(sincronizacion);
  if (aviso) return NextResponse.json({ error: aviso }, { status: 502 });
  return NextResponse.json({ ok: true });
}

export const POST = conErrores(manejarPOST);
