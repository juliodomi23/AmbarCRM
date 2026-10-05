import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { getProvider } from "@/lib/channel";
import { META_GRAPH_URL } from "@/lib/meta/config";
import { tokenFromChannelConfig } from "@/lib/meta/credentials";

export const dynamic = "force-dynamic";

async function channel(id: string | null) {
  if (!id || !/^\d+$/.test(id)) return null;
  return db.canalWhatsapp.findFirst({
    where: { id: BigInt(id), proveedor: "cloud_api", activo: true }
  });
}

export async function GET(req: NextRequest) {
  const session = await requireSesion(true);
  if ("error" in session) return session.error;
  const canal = await channel(req.nextUrl.searchParams.get("canalId"));
  if (!canal) return NextResponse.json({ error: "canal inexistente" }, { status: 404 });
  const provider = getProvider("cloud_api", canal.config, canal.instancia);
  return NextResponse.json({ plantillas: await provider.listarPlantillas!() });
}

export async function POST(req: NextRequest) {
  const session = await requireSesion(true);
  if ("error" in session) return session.error;
  const body = await req.json().catch(() => ({}));
  const canal = await channel(String(body.canalId || ""));
  if (!canal) return NextResponse.json({ error: "canal inexistente" }, { status: 404 });

  const name = String(body.name || "").trim().toLowerCase();
  const language = String(body.language || "es_MX").trim();
  const category = String(body.category || "UTILITY").trim().toUpperCase();
  const text = String(body.body || "").trim();
  if (!/^[a-z0-9_]{1,512}$/.test(name)) {
    return NextResponse.json({ error: "el nombre solo acepta minúsculas, números y guion bajo" }, { status: 400 });
  }
  if (!text || text.length > 1024) {
    return NextResponse.json({ error: "el mensaje debe tener entre 1 y 1024 caracteres" }, { status: 400 });
  }
  if (!new Set(["UTILITY", "MARKETING"]).has(category)) {
    return NextResponse.json({ error: "categoría inválida" }, { status: 400 });
  }

  const config = (canal.config || {}) as Record<string, unknown>;
  const wabaId = typeof config.wabaId === "string" ? config.wabaId : "";
  const token = tokenFromChannelConfig(config);
  if (!wabaId || !token) return NextResponse.json({ error: "canal sin credenciales Meta" }, { status: 400 });

  const response = await fetch(`${META_GRAPH_URL}/${wabaId}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, language, category, components: [{ type: "BODY", text }] })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return NextResponse.json({ error: data?.error?.message || `Meta HTTP ${response.status}` }, { status: 502 });
  }
  return NextResponse.json({
    ok: true,
    plantilla: { name, language, category, status: data.status || "PENDING", id: data.id }
  }, { status: 201 });
}
