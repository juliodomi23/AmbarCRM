import { NextRequest, NextResponse } from "next/server";
import { db, dbRaw, runWithOrg } from "@/lib/db";
import { verifyMetaWebhookSignature, verificarFirmaInstagramCanal } from "@/lib/meta/signature";
import { normalizarInstagram, perfilInstagram } from "@/lib/channel/instagram";
import { ingestarEntrante } from "@/lib/services/ingest";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams;
  const esperado = process.env.MESSENGER_VERIFY_TOKEN?.trim();
  if (query.get("hub.mode") === "subscribe" && esperado && query.get("hub.verify_token") === esperado && query.get("hub.challenge")) {
    return new NextResponse(query.get("hub.challenge"), { headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: "verificación inválida" }, { status: 403 });
}

const firmaInvalida = () => NextResponse.json({ error: "firma inválida" }, { status: 401 });
const firmaGlobal = (raw: string, firma: string | null) => verifyMetaWebhookSignature(raw, firma) ||
  verifyMetaWebhookSignature(raw, firma, process.env.INSTAGRAM_APP_SECRET?.trim());

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const firma = req.headers.get("x-hub-signature-256");
  let payload;
  try { payload = JSON.parse(raw); }
  catch { return firmaGlobal(raw, firma) ? NextResponse.json({ error: "JSON inválido" }, { status: 400 }) : firmaInvalida(); }
  if (!Array.isArray(payload?.entry)) {
    return firmaGlobal(raw, firma) ? NextResponse.json({ ok: true }) : firmaInvalida();
  }
  console.log("[instagram-webhook]", payload.object, payload.entry.map((e: { id?: unknown; messaging?: unknown[] }) => `${e?.id}:${e?.messaging?.length ?? 0}`).join(","), "firma", firmaGlobal(raw, firma));
  let autorizada = false;
  let rechazada = false;
  for (const entry of payload.entry) {
    if (!["string", "number"].includes(typeof entry?.id)) continue;
    const instagramId = String(entry.id);
    if (!/^\d{1,40}$/.test(instagramId)) continue;
    const filas = await dbRaw.$queryRaw<{ org: bigint | null }[]>`SELECT resolve_org_by_instagram(${instagramId}) AS org`;
    const org = filas[0]?.org;
    if (org == null) continue;
    await runWithOrg(org, async () => {
      const canal = await db.canalWhatsapp.findFirst({ where: { proveedor: "instagram", activo: true,
        config: { path: ["instagramId"], equals: instagramId } } });
      if (!canal) return;
      const config = canal.config as Record<string, unknown>;
      if (!verificarFirmaInstagramCanal(config, raw, firma)) { rechazada = true; return; }
      autorizada = true;
      if (payload.object !== "instagram" || !Array.isArray(entry.messaging)) return;
      const appId = typeof config.appId === "string" ? config.appId : process.env.META_APP_ID?.trim();
      for (const mensaje of normalizarInstagram({ entry: [entry] }, appId)) {
        if (await db.mensaje.findFirst({ where: { canalId: canal.id, waMessageId: mensaje.waMessageId } })) continue;
        const existente = await db.contacto.findFirst({ where: { canalId: canal.id, identificadorExterno: mensaje.identificadorExterno } });
        const perfil = existente ? {} : await perfilInstagram(config, mensaje.identificadorExterno!);
        await ingestarEntrante({ ...mensaje, ...perfil }, canal.id);
      }
    });
  }
  if (rechazada && !autorizada) return firmaInvalida();
  return NextResponse.json({ ok: true });
}
