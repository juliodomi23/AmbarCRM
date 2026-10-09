import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { META_GRAPH_URL } from "@/lib/meta/config";
import { tokenFromChannelConfig } from "@/lib/meta/credentials";
import { conErrores } from "@/lib/errores-api";

export const dynamic = "force-dynamic";

/** Edita únicamente los campos administrativos permitidos del canal. */
async function manejarPATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await requireSesion(true);
  if ("error" in s) return s.error;

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  for (const k of ["nombre", "activo"]) {
    if (k in body) data[k] = body[k];
  }
  await db.canalWhatsapp.update({ where: { id: BigInt(params.id) }, data });
  return NextResponse.json({ ok: true });
}

/** Elimina la configuración de un canal. Por defecto conserva conversaciones y contactos. */
async function manejarDELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await requireSesion(true);
  if ("error" in s) return s.error;

  const canalId = BigInt(params.id);
  const canal = await db.canalWhatsapp.findUnique({ where: { id: canalId } });
  if (!canal) return NextResponse.json({ error: "canal inexistente" }, { status: 404 });

  if (canal.proveedor === "cloud_api") {
    const config = (canal.config || {}) as Record<string, unknown>;
    const wabaId = typeof config.wabaId === "string" ? config.wabaId : "";
    const token = tokenFromChannelConfig(config);
    if (wabaId && token) {
      const response = await fetch(`${META_GRAPH_URL}/${wabaId}/subscribed_apps`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        return NextResponse.json(
          { error: data?.error?.message || "Meta no permitió desconectar la aplicación" },
          { status: 502 }
        );
      }
    }
  }

  const body = await req.json().catch(() => ({}));
  let borrados: { conversaciones: number; grupos: number } | undefined;
  if (body?.borrarDatos === true) {
    const conversaciones = await db.conversacion.deleteMany({ where: { canalId } });
    const grupos = await db.grupo.deleteMany({ where: { canalId } });
    borrados = { conversaciones: conversaciones.count, grupos: grupos.count };
  }

  // Las relaciones del canal usan SET NULL: sin borrarDatos, el histórico queda conservado.
  await db.canalWhatsapp.delete({ where: { id: canalId } });
  return NextResponse.json({ ok: true, borrados });
}

export const PATCH = conErrores(manejarPATCH);
export const DELETE = conErrores(manejarDELETE);
