import { NextRequest, NextResponse } from "next/server";
import { db, dbRaw, runWithOrg } from "@/lib/db";
import { getProvider } from "@/lib/channel";
import { ingestarEntrante } from "@/lib/services/ingest";
import { ingestarGrupoEntrante } from "@/lib/services/grupos";
import { requireApiKey } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/** phone_number_id que viene en el payload de la Cloud API de Meta (multi-tenant). */
function phoneNumberId(payload: any): string | null {
  for (const entry of payload?.entry ?? [])
    for (const ch of entry?.changes ?? [])
      if (ch?.value?.metadata?.phone_number_id) return String(ch.value.metadata.phone_number_id);
  return null;
}

/** Resuelve el tenant del evento sin contexto (funciones SECURITY DEFINER que saltan RLS). */
async function resolverOrgId(req: NextRequest, payload: any): Promise<bigint | null> {
  const canalIdParam = req.nextUrl.searchParams.get("canal");
  if (canalIdParam) {
    const r = await dbRaw.$queryRawUnsafe<{ org: bigint | null }[]>(
      "SELECT resolve_org_by_canal($1) AS org", BigInt(canalIdParam)
    );
    return r[0]?.org ?? null;
  }
  const pid = phoneNumberId(payload);
  if (pid) {
    const r = await dbRaw.$queryRawUnsafe<{ org: bigint | null }[]>(
      "SELECT resolve_org_by_phone($1) AS org", pid
    );
    return r[0]?.org ?? null;
  }
  return null;
}

/**
 * Webhook de entrada. n8n recibe el evento de Evolution/Meta y lo reenvía aquí.
 * Header: x-api-key = WA_API_KEY.
 * Query:  ?canal=<id>  (Evolution); para Meta el tenant sale del phone_number_id.
 */
export async function POST(req: NextRequest) {
  const noAuth = requireApiKey(req);
  if (noAuth) return noAuth;

  const payload = await req.json().catch(() => null);
  if (!payload) return NextResponse.json({ error: "body inválido" }, { status: 400 });

  // Resumen por evento (diagnóstico): tipo, remitente y si es fromMe.
  {
    const d = Array.isArray(payload?.data) ? payload.data[0] : payload?.data;
    console.log(
      `[wa/webhook] event=${payload?.event ?? "?"} jid=${d?.key?.remoteJid ?? "?"} fromMe=${d?.key?.fromMe ?? "?"} tipo=${Object.keys(d?.message ?? {})[0] ?? "?"}`
    );
  }

  const orgId = await resolverOrgId(req, payload);
  if (orgId == null) return NextResponse.json({ error: "no se pudo resolver el tenant" }, { status: 400 });

  return runWithOrg(orgId, () => procesar(req, payload));
}

async function procesar(req: NextRequest, payload: any) {
  const canalIdParam = req.nextUrl.searchParams.get("canal");
  const canal = canalIdParam
    ? await db.canalWhatsapp.findUnique({ where: { id: BigInt(canalIdParam) } })
    : await db.canalWhatsapp.findFirst({ where: { activo: true } });

  const proveedor = canal?.proveedor ?? "evolution";
  const provider = getProvider(proveedor);

  // Leído en el celular: chats.update/upsert trae el contador en 0 → se limpia en el CRM
  // para que la bandeja no marque como "sin abrir" lo que ya atendiste desde el teléfono.
  if (payload?.event === "chats.update" || payload?.event === "chats.upsert") {
    const items = Array.isArray(payload.data) ? payload.data : [payload.data];
    let leidas = 0;
    for (const ch of items) {
      const unread = ch?.unreadMessages ?? ch?.unreadCount;
      const jid: string = ch?.remoteJid ?? ch?.id ?? "";
      if (unread === 0 && jid.includes("@s.whatsapp.net")) {
        const tel = jid.split("@")[0].replace(/\D/g, "");
        const contacto = await db.contacto.findFirst({ where: { telefono: tel } });
        if (contacto) {
          await db.conversacion.updateMany({ where: { contactoId: contacto.id }, data: { noLeidos: 0 } });
          leidas++;
        }
      }
    }
    return NextResponse.json({ ok: true, leidas });
  }

  // Acuses de estado (entregado/leído): actualizan el mensaje saliente y salen.
  if (provider.normalizarEstado) {
    const estados = provider.normalizarEstado(payload);
    if (estados.length) {
      for (const e of estados) {
        await db.mensaje.updateMany({ where: { waMessageId: e.waMessageId }, data: { status: e.status } });
      }
      return NextResponse.json({ ok: true, estados: estados.length });
    }
  }

  const entrantes = provider.normalizarEntrante(payload);
  const resultados = [];
  for (const m of entrantes) {
    if (!m.telefono) continue;
    resultados.push(await ingestarEntrante(m, canal?.id ?? null));
  }

  // Mensajes de grupos (bandeja aparte).
  let grupos = 0;
  if (provider.normalizarEntranteGrupo) {
    for (const g of provider.normalizarEntranteGrupo(payload)) {
      await ingestarGrupoEntrante(g, canal?.id ?? null);
      grupos++;
    }
  }

  return NextResponse.json({ ok: true, procesados: resultados.length, grupos });
}
