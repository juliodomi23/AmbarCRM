import { NextRequest, NextResponse } from "next/server";
import { db, dbRaw, runWithOrg } from "@/lib/db";
import { getProvider } from "@/lib/channel";
import { ingestarEntrante } from "@/lib/services/ingest";
import { clasificar } from "@/lib/campanas-envio-motor";
import { verifyMetaWebhookSignature } from "@/lib/meta/signature";
import { decryptMetaToken } from "@/lib/meta/credentials";
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

const firmaInvalida = () => {
  console.warn("[meta/webhook] firma inválida: revisa META_APP_SECRET o el App Secret del canal manual");
  return NextResponse.json({ error: "firma inválida" }, { status: 401 });
};

/** Canal conectado a mano con otra app de Meta: su webhook viene firmado con el App Secret de esa app. */
function firmaDelCanal(config: unknown, rawBody: string, firma: string | null) {
  const cifrado = (config as Record<string, unknown> | null)?.appSecretEncrypted;
  if (typeof cifrado !== "string") return false;
  try {
    return verifyMetaWebhookSignature(rawBody, firma, decryptMetaToken(cifrado));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const firma = req.headers.get("x-hub-signature-256");
  // Con la firma global se procesa como siempre. Sin ella, solo se acepta si coincide con el
  // App Secret del canal manual dueño del phone_number_id; nada se procesa antes de comprobarlo.
  const firmaGlobal = verifyMetaWebhookSignature(rawBody, firma);

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return firmaGlobal ? NextResponse.json({ error: "body inválido" }, { status: 400 }) : firmaInvalida();
  }

  // Los eventos de cuenta sin teléfono no corresponden a una conversación y se confirman.
  const phoneId = phoneNumberId(payload);
  if (!phoneId) {
    if (!firmaGlobal) return firmaInvalida();
    console.log(`[meta/webhook] evento phone_number_id=- campos=${eventFields(payload).join(",") || "-"}`);
    return NextResponse.json({ ok: true, procesados: 0, fields: eventFields(payload) });
  }

  const result = await dbRaw.$queryRawUnsafe<{ org: bigint | null }[]>(
    "SELECT resolve_org_by_phone($1) AS org",
    phoneId
  );
  const orgId = result[0]?.org;
  if (orgId == null) {
    if (!firmaGlobal) return firmaInvalida();
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
    if (!firmaGlobal && !firmaDelCanal(canal?.config, rawBody, firma)) return firmaInvalida();
    // Una línea por evento: confirma en los logs si Meta está entregando webhooks.
    console.log(`[meta/webhook] evento phone_number_id=${phoneId} campos=${eventFields(payload).join(",") || "-"}`);
    if (!canal) {
      console.warn(`[meta/webhook] canal no encontrado para phone_number_id=${phoneId}`);
      return NextResponse.json({ ok: true, procesados: 0 });
    }

    const provider = getProvider("cloud_api", canal.config, canal.instancia);
    const statuses = provider.normalizarEstado?.(payload) || [];
    for (const status of statuses) {
      const estadosAnteriores = {
        enviado: ["pendiente", "enviado"],
        entregado: ["pendiente", "enviado", "entregado"],
        leido: ["pendiente", "enviado", "entregado", "leido"]
      } as const;
      await db.mensaje.updateMany({
        where: {
          canalId: canal.id,
          waMessageId: status.waMessageId,
          ...(status.status === "fallido"
            ? {}
            : { status: { in: [...estadosAnteriores[status.status]] } })
        },
        data: { status: status.status, ...(status.error ? { errorDetalle: status.error } : {}) }
      });
      if (status.status === "entregado" || status.status === "leido" || status.status === "fallido") {
        const destinatario = await db.campanaDestinatario.findFirst({ where: { waMessageId: status.waMessageId, campana: { canalId: canal.id }, estado: { in: status.status === "fallido" ? ["enviado", "entregado"] : status.status === "leido" ? ["enviado", "entregado"] : ["enviado"] } } });
        if (destinatario) {
          const fallo = status.status === "fallido" ? clasificar({ ok: false, error: status.error, errorCodigo: status.errorCodigo }, destinatario.reintentos) : null;
          await db.campanaDestinatario.update({ where: { id: destinatario.id }, data: { estado: fallo?.estado ?? status.status, motivo: fallo?.motivo ?? null, errorCodigo: status.errorCodigo, reintentarAt: fallo?.reintentarAt ?? null } });
          if (status.errorCodigo === 131050) await db.contacto.update({ where: { id: destinatario.contactoId }, data: { optOutDifusion: true } });
          if (fallo?.pausar) await db.campanaEnvio.update({ where: { id: destinatario.campanaId }, data: { estado: "pausada", motivoPausa: fallo.pausar } });
        }
      }
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
