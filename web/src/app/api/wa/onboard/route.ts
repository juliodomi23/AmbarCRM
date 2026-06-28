import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v21.0";

/**
 * Cierre del Embedded Signup (Tech Provider). El frontend lanza FB.login con tu config_id;
 * el popup devuelve `code` + el evento WA_EMBEDDED_SIGNUP con `wabaId` y `phoneNumberId`.
 * Aquí: cambiamos el code por el token del cliente, suscribimos su WABA a nuestra app y
 * guardamos el canal en la org del usuario (el tenant sale de la sesión → RLS lo acota).
 *
 * Body: { code, wabaId, phoneNumberId, nombre? }
 * Env:  META_APP_ID, META_APP_SECRET
 */
export async function POST(req: NextRequest) {
  const sesion = await requireSesion(true);
  if ("error" in sesion) return sesion.error;

  const { code, wabaId, phoneNumberId, nombre } = await req.json().catch(() => ({}));
  if (!code || !wabaId || !phoneNumberId) {
    return NextResponse.json({ error: "faltan code, wabaId o phoneNumberId" }, { status: 400 });
  }

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return NextResponse.json({ error: "META_APP_ID / META_APP_SECRET sin configurar" }, { status: 500 });
  }

  // 1. code -> token del cliente (system user de la WABA del cliente).
  const tokenRes = await fetch(
    `${GRAPH}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${encodeURIComponent(code)}`
  );
  const tokenData = await tokenRes.json().catch(() => ({}));
  const token: string | undefined = tokenData?.access_token;
  if (!tokenRes.ok || !token) {
    return NextResponse.json({ error: tokenData?.error?.message ?? "fallo al canjear el code" }, { status: 502 });
  }

  // 2. Suscribir la WABA del cliente a nuestra app (para recibir sus webhooks).
  const subRes = await fetch(`${GRAPH}/${wabaId}/subscribed_apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
  const subData = await subRes.json().catch(() => ({}));
  if (!subRes.ok || !subData?.success) {
    return NextResponse.json({ error: subData?.error?.message ?? "no se pudo suscribir la WABA" }, { status: 502 });
  }

  // 3. Guardar el canal en la org del usuario (org_id por contexto/RLS).
  const config = { token, phoneNumberId: String(phoneNumberId), wabaId: String(wabaId) };
  const canal = await db.canalWhatsapp.create({
    data: {
      nombre: nombre || "WhatsApp Oficial",
      proveedor: "cloud_api",
      estado: "conectado",
      config,
      activo: true
    }
  });

  return NextResponse.json({ ok: true, canalId: Number(canal.id), phoneNumberId: config.phoneNumberId });
}
