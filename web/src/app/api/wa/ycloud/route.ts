import { NextRequest, NextResponse } from "next/server";
import { db, dbRaw, runWithOrg } from "@/lib/db";
import { getProvider } from "@/lib/channel";
import { verificarFirmaYCloud } from "@/lib/channel/ycloud";
import { ingestarEntrante } from "@/lib/services/ingest";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.text();
  let payload: unknown;
  try {
    payload = JSON.parse(body || "{}");
  } catch {
    return NextResponse.json({ error: "body inválido" }, { status: 400 });
  }
  const canalParam = req.nextUrl.searchParams.get("canal");
  if (!canalParam || !/^[0-9]+$/.test(canalParam)) {
    return NextResponse.json({ error: "Falta ?canal=<id>" }, { status: 400 });
  }

  const canalId = BigInt(canalParam);
  const org = await dbRaw.$queryRawUnsafe<{ org: bigint | null }[]>(
    "SELECT resolve_org_by_canal($1) AS org", canalId
  );
  if (!org[0]?.org) return NextResponse.json({ error: "canal no encontrado" }, { status: 404 });

  return runWithOrg(org[0].org, async () => {
    const canal = await db.canalWhatsapp.findUnique({ where: { id: canalId } });
    if (!canal || canal.proveedor !== "ycloud") {
      return NextResponse.json({ error: "el canal no es YCloud" }, { status: 400 });
    }
    const config = canal.config && typeof canal.config === "object" && !Array.isArray(canal.config)
      ? canal.config as { webhookSecret?: string }
      : {};
    const secret = process.env.YCLOUD_WEBHOOK_SECRET || config.webhookSecret || "";
    if (!verificarFirmaYCloud(body, req.headers.get("YCloud-Signature"), secret)) {
      return NextResponse.json({ error: "firma inválida" }, { status: 401 });
    }

    const provider = getProvider("ycloud", canal.config, canal.instancia);
    const estados = provider.normalizarEstado?.(payload) || [];
    for (const estado of estados) {
      await db.mensaje.updateMany({
        where: { waMessageId: estado.waMessageId },
        data: { status: estado.status }
      });
    }
    const entrantes = provider.normalizarEntrante(payload);
    let procesados = 0;
    for (const mensaje of entrantes) {
      if (mensaje.telefono) {
        await ingestarEntrante(mensaje, canal.id);
        procesados++;
      }
    }
    return NextResponse.json({ ok: true, estados: estados.length, procesados });
  });
}
