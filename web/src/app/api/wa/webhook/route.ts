import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getProvider } from "@/lib/channel";
import { ingestarEntrante } from "@/lib/services/ingest";
import { ingestarGrupoEntrante } from "@/lib/services/grupos";
import { requireApiKey } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * Webhook de entrada. n8n recibe el evento de Evolution/Meta y lo reenvía aquí.
 * Header: x-api-key = WA_API_KEY.
 * Query:  ?canal=<id>  (opcional; si no, usa el primer canal activo).
 */
export async function POST(req: NextRequest) {
  const noAuth = requireApiKey(req);
  if (noAuth) return noAuth;

  const payload = await req.json().catch(() => null);
  if (!payload) return NextResponse.json({ error: "body inválido" }, { status: 400 });

  const canalIdParam = req.nextUrl.searchParams.get("canal");
  const canal = canalIdParam
    ? await db.canalWhatsapp.findUnique({ where: { id: BigInt(canalIdParam) } })
    : await db.canalWhatsapp.findFirst({ where: { activo: true } });

  const proveedor = canal?.proveedor ?? "evolution";
  const provider = getProvider(proveedor);

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
