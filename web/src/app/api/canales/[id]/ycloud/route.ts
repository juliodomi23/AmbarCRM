import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

const YCLOUD_API = "https://api.ycloud.com/v2";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const session = await requireSesion(true);
  if ("error" in session) return session.error;
  const { id } = await props.params;
  const body = await req.json().catch(() => ({}));
  const canal = await db.canalWhatsapp.findUnique({ where: { id: BigInt(id) } });
  if (!canal) return NextResponse.json({ error: "canal no encontrado" }, { status: 404 });

  const stored = canal.config && typeof canal.config === "object" && !Array.isArray(canal.config)
    ? canal.config as Record<string, unknown>
    : {};
  const apiKey = String(body.apiKey || stored.apiKey || process.env.YCLOUD_API_KEY || "");
  const phoneNumber = String(body.phoneNumber || canal.instancia || process.env.YCLOUD_PHONE_NUMBER || "");
  const baseUrl = String(process.env.YCLOUD_WEBHOOK_BASE_URL || process.env.NEXTAUTH_URL || req.nextUrl.origin)
    .replace(/\/$/, "");
  if (!apiKey) return NextResponse.json({ error: "Falta la API key de YCloud" }, { status: 400 });
  if (!phoneNumber) return NextResponse.json({ error: "Falta el número de negocio YCloud" }, { status: 400 });
  if (/localhost|127\\.0\\.0\\.1/.test(baseUrl)) {
    return NextResponse.json({ error: "YCloud necesita una URL pública HTTPS en YCLOUD_WEBHOOK_BASE_URL" }, { status: 400 });
  }

  const headers = { Accept: "application/json", "Content-Type": "application/json", "X-API-Key": apiKey };
  const webhookUrl = baseUrl + "/api/wa/ycloud?canal=" + id;
  try {
    const listResponse = await fetch(YCLOUD_API + "/webhookEndpoints?limit=100", { headers });
    const list = await listResponse.json().catch(() => ({}));
    const existing = (list?.items || []).find((item: any) => item.url === webhookUrl);
    let endpoint = existing;
    if (!endpoint) {
      const response = await fetch(YCLOUD_API + "/webhookEndpoints", {
        method: "POST",
        headers,
        body: JSON.stringify({
          url: webhookUrl,
          enabledEvents: ["whatsapp.inbound_message.received", "whatsapp.message.updated"],
          description: "AmbarCRM canal " + id,
          status: "active"
        })
      });
      endpoint = await response.json().catch(() => ({}));
      if (!response.ok) return NextResponse.json({ error: endpoint?.message || "YCloud rechazó crear el webhook" }, { status: 502 });
    }
    if (!endpoint?.secret && endpoint?.id) {
      const detail = await fetch(YCLOUD_API + "/webhookEndpoints/" + encodeURIComponent(endpoint.id), { headers });
      endpoint = await detail.json().catch(() => endpoint);
    }
    if (!endpoint?.secret) return NextResponse.json({ error: "YCloud no devolvió el secreto del webhook" }, { status: 502 });

    await db.canalWhatsapp.update({
      where: { id: BigInt(id) },
      data: {
        proveedor: "ycloud",
        instancia: phoneNumber,
        estado: "conectado",
        config: { ...stored, apiKey, webhookSecret: endpoint.secret, webhookId: endpoint.id, webhookUrl }
      }
    });
    return NextResponse.json({ ok: true, webhookUrl, webhookId: endpoint.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo conectar con YCloud" }, { status: 502 });
  }
}
