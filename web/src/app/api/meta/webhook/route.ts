import { NextRequest, NextResponse } from "next/server";
import { db, dbRaw, runWithOrg } from "@/lib/db";
import { getProvider } from "@/lib/channel";
import { ingestarEntrante } from "@/lib/services/ingest";
import { verifyMetaWebhookSignature } from "@/lib/meta/signature";
import { normalizarHistorialCoexistence } from "@/lib/channel/cloudapi";

export const dynamic = "force-dynamic";

function phoneNumberId(payload: any): string | null {
  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      const id = change?.value?.metadata?.phone_number_id;
      if (id) return String(id);
    }
  }
  return null;
}

function eventFields(payload: any): string[] {
  const fields: string[] = [];
  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      if (change?.field) fields.push(String(change.field));
    }
  }
  return fields;
}

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim();
  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: "verificación inválida" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  if (!verifyMetaWebhookSignature(rawBody, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "firma inválida" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "body inválido" }, { status: 400 });
  }

  // Los eventos de cuenta sin teléfono no corresponden a una conversación y se confirman.
  const phoneId = phoneNumberId(payload);
  if (!phoneId) return NextResponse.json({ ok: true, procesados: 0, fields: eventFields(payload) });

  const result = await dbRaw.$queryRawUnsafe<{ org: bigint | null }[]>(
    "SELECT resolve_org_by_phone($1) AS org",
    phoneId
  );
  const orgId = result[0]?.org;
  if (orgId == null) {
    // Meta reintenta webhooks no-2xx. Un número aún no persistido no debe crear una tormenta.
    console.warn(`[meta/webhook] phone_number_id desconocido: ${phoneId}`);
    return NextResponse.json({ ok: true, procesados: 0 });
  }

  return runWithOrg(orgId, async () => {
    const channels = await db.canalWhatsapp.findMany({
      where: { proveedor: "cloud_api", activo: true }
    });
    const canal = channels.find((item) => {
      const config = (item.config || {}) as Record<string, unknown>;
      return item.instancia === phoneId || config.phoneNumberId === phoneId;
    });
    if (!canal) {
      console.warn(`[meta/webhook] canal no encontrado para phone_number_id=${phoneId}`);
      return NextResponse.json({ ok: true, procesados: 0 });
    }

    const provider = getProvider("cloud_api", canal.config, canal.instancia);
    const statuses = provider.normalizarEstado?.(payload) || [];
    for (const status of statuses) {
      await db.mensaje.updateMany({
        where: { waMessageId: status.waMessageId },
        data: { status: status.status }
      });
    }

    const messages = [
      ...provider.normalizarEntrante(payload),
      ...normalizarHistorialCoexistence(payload)
    ];
    let processed = 0;
    for (const message of messages) {
      if (!message.telefono) continue;
      await ingestarEntrante(message, canal.id);
      processed++;
    }

    return NextResponse.json({ ok: true, procesados: processed, estados: statuses.length });
  });
}
