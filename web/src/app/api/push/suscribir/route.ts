import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { pushConfigurado, vapidPublicKey } from "@/lib/push";

export const dynamic = "force-dynamic";

/** Clave pública VAPID para que el navegador se suscriba. */
export async function GET() {
  const s = await requireSesion();
  if ("error" in s) return s.error;
  return NextResponse.json({ configurado: pushConfigurado, publicKey: vapidPublicKey });
}

/** Guarda la suscripción push del navegador. Body: PushSubscription.toJSON() */
export async function POST(req: NextRequest) {
  const s = await requireSesion();
  if ("error" in s) return s.error;

  const sub = await req.json().catch(() => null);
  const endpoint: string | undefined = sub?.endpoint;
  const p256dh: string | undefined = sub?.keys?.p256dh;
  const auth: string | undefined = sub?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "suscripción inválida" }, { status: 400 });
  }

  await db.pushSuscripcion.upsert({
    where: { endpoint },
    update: { p256dh, auth, usuarioId: s.userId },
    create: { endpoint, p256dh, auth, usuarioId: s.userId }
  });
  return NextResponse.json({ ok: true });
}
