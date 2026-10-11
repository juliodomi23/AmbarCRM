import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db, dbRaw } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { META_GRAPH_URL } from "@/lib/meta/config";
import { encryptMetaToken } from "@/lib/meta/credentials";
import { registrarNumero } from "@/lib/meta/registro";

export const dynamic = "force-dynamic";

/**
 * Conexión manual de WhatsApp Cloud API (como Chatwoot): WABA ID + Phone Number ID + token permanente
 * de un usuario del sistema y, si la app de Meta no es la de Tech Provider, su App Secret para validar
 * los webhooks. Sirve para probar sin Embedded Signup mientras Meta aprueba la app.
 * ponytail: duplica unas líneas de wa/onboard a propósito para no tocar el flujo que Meta está revisando.
 */

const ID_META = /^\d{5,25}$/;
const APP_SECRET = /^[a-f0-9]{32}$/i;

async function graph(path: string, token: string, appSecret: string | null, init?: RequestInit) {
  const url = new URL(`${META_GRAPH_URL}/${path}`);
  // appsecret_proof hace que Meta rechace la llamada si el App Secret no es de la app dueña del token.
  if (appSecret) url.searchParams.set("appsecret_proof", createHmac("sha256", appSecret).update(token).digest("hex"));
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.error_user_msg || data?.error?.message || `Meta HTTP ${response.status}`);
  return data;
}

/** Datos que el admin pega en la configuración del webhook de su app de Meta. */
export async function GET() {
  const session = await requireSesion(true);
  if ("error" in session) return session.error;
  const base = (process.env.NEXTAUTH_URL ?? "").replace(/\/+$/, "");
  return NextResponse.json({
    callbackUrl: base ? `${base}/api/meta/webhook` : null,
    verifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() || null,
    appSecretGlobal: Boolean(process.env.META_APP_SECRET?.trim())
  });
}

export async function POST(req: NextRequest) {
  const session = await requireSesion(true);
  if ("error" in session) return session.error;

  const body = await req.json().catch(() => ({}));
  const wabaId = String(body.wabaId ?? "").trim();
  const phoneNumberId = String(body.phoneNumberId ?? "").trim();
  const token = String(body.token ?? "").trim();
  const appSecret = String(body.appSecret ?? "").trim() || null;
  const nombre = String(body.nombre ?? "").trim().slice(0, 80);

  if (!ID_META.test(wabaId) || !ID_META.test(phoneNumberId)) {
    return NextResponse.json({ error: "WABA ID y Phone Number ID son números (los copias de Meta)" }, { status: 400 });
  }
  if (token.length < 50 || /\s/.test(token)) {
    return NextResponse.json({ error: "El token no parece válido: copia el token permanente completo" }, { status: 400 });
  }
  if (appSecret && !APP_SECRET.test(appSecret)) {
    return NextResponse.json({ error: "El App Secret son 32 caracteres (0-9 y a-f)" }, { status: 400 });
  }
  if (!appSecret && !process.env.META_APP_SECRET?.trim()) {
    return NextResponse.json(
      { error: "Falta el App Secret de tu app de Meta: sin él no se pueden validar los mensajes que llegan" },
      { status: 400 }
    );
  }

  try {
    // Valida token, WABA, número y App Secret en una sola llamada.
    const phonesData = await graph(
      `${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,platform_type&limit=100`,
      token,
      appSecret
    );
    const phones = Array.isArray(phonesData?.data) ? phonesData.data : [];
    const phone = phones.find((item: any) => String(item.id) === phoneNumberId);
    if (!phone) {
      return NextResponse.json({ error: "Ese Phone Number ID no pertenece a esa WABA (o el token no tiene acceso)" }, { status: 400 });
    }

    const owner = await dbRaw.$queryRawUnsafe<{ org: bigint | null }[]>("SELECT resolve_org_by_phone($1) AS org", phoneNumberId);
    const ownerOrg = owner[0]?.org;
    if (ownerOrg != null && ownerOrg !== session.orgId) {
      return NextResponse.json({ error: "Este número ya está conectado en otra organización; desconéctalo allá primero" }, { status: 409 });
    }

    await graph(`${wabaId}/subscribed_apps`, token, appSecret, { method: "POST" });

    // Un número de prueba o ya activo en Cloud API no se vuelve a registrar (Meta lo rechazaría por su PIN).
    const registro: { pinEncrypted?: string; error?: string } =
      phone.platform_type === "CLOUD_API" ? {} : await registrarNumero(phoneNumberId, token);

    const config = {
      tokenEncrypted: encryptMetaToken(token),
      phoneNumberId,
      wabaId,
      onboardingMode: "manual",
      ...(appSecret ? { appSecretEncrypted: encryptMetaToken(appSecret) } : {}),
      ...(registro.pinEncrypted ? { pinEncrypted: registro.pinEncrypted } : {}),
      verifiedName: phone.verified_name || null,
      qualityRating: phone.quality_rating || null,
      connectedAt: new Date().toISOString()
    };
    const values = {
      nombre: nombre || phone.verified_name || "WhatsApp Oficial",
      proveedor: "cloud_api" as const,
      telefono: phone.display_phone_number || null,
      instancia: phoneNumberId,
      estado: "conectado" as const,
      config,
      activo: true
    };
    const existing = await db.canalWhatsapp.findFirst({ where: { proveedor: "cloud_api", instancia: phoneNumberId } });
    const canal = existing
      ? await db.canalWhatsapp.update({ where: { id: existing.id }, data: values })
      : await db.canalWhatsapp.create({ data: values });

    return NextResponse.json({
      ok: true,
      canalId: Number(canal.id),
      telefono: canal.telefono,
      nombre: canal.nombre,
      aviso: registro.error
        ? `Quedó conectado, pero Meta no activó el número: ${registro.error}. Usa "Activar número".`
        : undefined
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Meta rechazó los datos: ${error instanceof Error ? error.message : "error desconocido"}` },
      { status: 502 }
    );
  }
}
