import { NextRequest, NextResponse } from "next/server";
import { db, dbRaw, runWithOrg } from "@/lib/db";
import { verifyMetaWebhookSignature } from "@/lib/meta/signature";
import { normalizarMessenger, perfilMessenger } from "@/lib/channel/messenger";
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

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyMetaWebhookSignature(raw, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "firma inválida" }, { status: 401 });
  }
  let payload;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  if (payload?.object !== "page" || !Array.isArray(payload.entry)) return NextResponse.json({ ok: true });
  for (const entry of payload.entry) {
    if (!entry?.id || !Array.isArray(entry.messaging)) continue;
    const pageId = String(entry.id);
    const filas = await dbRaw.$queryRawUnsafe<{ org: bigint | null }[]>("SELECT resolve_org_by_page($1) AS org", pageId);
    const org = filas[0]?.org;
    if (org == null) continue;
    await runWithOrg(org, async () => {
      const canal = await db.canalWhatsapp.findFirst({ where: { proveedor: "messenger", activo: true, config: { path: ["pageId"], equals: pageId } } });
      if (!canal) return;
      for (const mensaje of normalizarMessenger({ entry: [entry] })) {
        const existente = await db.contacto.findFirst({ where: { canalId: canal.id, identificadorExterno: mensaje.identificadorExterno } });
        const perfil = existente ? {} : await perfilMessenger(canal.config as Record<string, unknown>, mensaje.identificadorExterno!);
        await ingestarEntrante({ ...mensaje, ...perfil }, canal.id);
      }
      for (const evento of entry.messaging) {
        const status = evento.read ? "leido" as const : evento.delivery ? "entregado" as const : null;
        if (!status) continue;
        const recibo = evento.read ?? evento.delivery;
        const anteriores = status === "leido" ? ["pendiente", "enviado", "entregado"] as const : ["pendiente", "enviado"] as const;
        if (Array.isArray(recibo.mids) && recibo.mids.length) {
          await db.mensaje.updateMany({ where: { canalId: canal.id, waMessageId: { in: recibo.mids.map(String) }, direccion: "saliente", interna: false, status: { in: [...anteriores] } }, data: { status } });
        } else if (Number.isFinite(Number(recibo.watermark)) && evento.sender?.id) {
          const watermark = new Date(Number(recibo.watermark));
          if (!Number.isFinite(watermark.getTime())) continue;
          await db.mensaje.updateMany({ where: { canalId: canal.id, direccion: "saliente", interna: false, status: { in: [...anteriores] },
            timestamp: { lte: watermark }, conversacion: { contacto: { identificadorExterno: String(evento.sender.id), canalId: canal.id } } }, data: { status } });
        }
      }
    });
  }
  return NextResponse.json({ ok: true });
}
