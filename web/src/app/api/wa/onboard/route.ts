import { NextRequest, NextResponse } from "next/server";
import { db, dbRaw } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { META_GRAPH_URL, requireMetaAppCredentials } from "@/lib/meta/config";
import { encryptMetaToken } from "@/lib/meta/credentials";
import { registrarNumero } from "@/lib/meta/registro";

export const dynamic = "force-dynamic";

async function graph(path: string, token: string, init?: RequestInit) {
  const response = await fetch(`${META_GRAPH_URL}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Meta HTTP ${response.status}`);
  return data;
}

export async function POST(req: NextRequest) {
  const session = await requireSesion(true);
  if ("error" in session) return session.error;

  const body = await req.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code : "";
  const wabaId = typeof body.wabaId === "string" ? body.wabaId : "";
  let phoneNumberId = typeof body.phoneNumberId === "string" ? body.phoneNumberId : "";
  if (!code || !wabaId) {
    return NextResponse.json({ error: "Meta no devolvió code o wabaId" }, { status: 400 });
  }

  try {
    const { appId, appSecret } = requireMetaAppCredentials();
    const params = new URLSearchParams({ client_id: appId, client_secret: appSecret, code });
    const tokenResponse = await fetch(`${META_GRAPH_URL}/oauth/access_token?${params}`);
    const tokenData = await tokenResponse.json().catch(() => ({}));
    const token = typeof tokenData?.access_token === "string" ? tokenData.access_token : "";
    if (!tokenResponse.ok || !token) {
      throw new Error(tokenData?.error?.message || "no se pudo canjear el código de Meta");
    }

    // Coexistence puede terminar sin phone_number_id. Lo descubrimos desde la WABA.
    const phonesData = await graph(
      `${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,platform_type&limit=100`,
      token
    );
    const phones = Array.isArray(phonesData?.data) ? phonesData.data : [];
    if (!phoneNumberId && phones.length === 1) phoneNumberId = String(phones[0].id);
    const phone = phones.find((item: any) => String(item.id) === phoneNumberId);
    if (!phoneNumberId || !phone) {
      throw new Error(
        phones.length > 1
          ? "la WABA tiene varios números y Meta no indicó cuál se conectó"
          : "no se encontró el número conectado dentro de la WABA"
      );
    }

    const owner = await dbRaw.$queryRawUnsafe<{ org: bigint | null }[]>(
      "SELECT resolve_org_by_phone($1) AS org",
      phoneNumberId
    );
    const ownerOrg = owner[0]?.org;
    if (ownerOrg != null && ownerOrg !== session.orgId) {
      return NextResponse.json(
        { error: "este número ya está conectado en otra organización; desconéctalo allá primero" },
        { status: 409 }
      );
    }

    await graph(`${wabaId}/subscribed_apps`, token, { method: "POST" });

    // Coexistence usa el registro de la app del celular; los demás números hay que activarlos.
    const coexistencia = body.onboardingMode === "coexistence";
    // Un número ya activo en Cloud API (p. ej. al reconectarlo) no se vuelve a registrar:
    // Meta lo rechazaría por el PIN de verificación en dos pasos que ya tiene.
    const yaActivo = phone.platform_type === "CLOUD_API";
    const registro: { pinEncrypted?: string; error?: string } = coexistencia || yaActivo
      ? {}
      : await registrarNumero(phoneNumberId, token);

    const config = {
      tokenEncrypted: encryptMetaToken(token),
      phoneNumberId,
      wabaId,
      onboardingMode: coexistencia ? "coexistence" : "cloud_api",
      ...(registro.pinEncrypted ? { pinEncrypted: registro.pinEncrypted } : {}),
      verifiedName: phone.verified_name || null,
      qualityRating: phone.quality_rating || null,
      connectedAt: new Date().toISOString()
    };

    const existing = await db.canalWhatsapp.findFirst({
      where: { proveedor: "cloud_api", instancia: phoneNumberId }
    });
    const values = {
      nombre: typeof body.nombre === "string" && body.nombre.trim()
        ? body.nombre.trim()
        : phone.verified_name || "WhatsApp Oficial",
      proveedor: "cloud_api" as const,
      telefono: phone.display_phone_number || null,
      instancia: phoneNumberId,
      estado: "conectado" as const,
      config,
      activo: true
    };
    const canal = existing
      ? await db.canalWhatsapp.update({ where: { id: existing.id }, data: values })
      : await db.canalWhatsapp.create({ data: values });

    return NextResponse.json({
      ok: true,
      canalId: Number(canal.id),
      phoneNumberId,
      telefono: canal.telefono,
      nombre: canal.nombre,
      aviso: registro.error
        ? `El número quedó conectado, pero Meta no lo activó: ${registro.error}. Usa "Activar número" en Números conectados.`
        : undefined
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "no se pudo completar el onboarding" },
      { status: 502 }
    );
  }
}
