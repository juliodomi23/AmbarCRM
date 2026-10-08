import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { generarToken } from "@/lib/services/bots";
import { validarWebhookUrl } from "@/lib/webhook-url";
import { referenciaAjena } from "@/lib/referencias";

export const dynamic = "force-dynamic";

/** Crea un bot. Body: { nombre, webhookUrl, canalId?, activo? } */
export async function POST(req: NextRequest) {
  const s = await requireSesion(true);
  if ("error" in s) return s.error;

  const { nombre, webhookUrl, canalId, activo } = await req.json().catch(() => ({}));
  if (!nombre || !webhookUrl) return NextResponse.json({ error: "faltan nombre o webhookUrl" }, { status: 400 });
  const errorUrl = validarWebhookUrl(String(webhookUrl));
  if (errorUrl) return NextResponse.json({ error: errorUrl }, { status: 400 });
  const ajena = await referenciaAjena({ canalId }, { canalId: "canal" });
  if (ajena) return NextResponse.json({ error: `${ajena} inexistente` }, { status: 400 });

  const bot = await db.bot.create({
    data: {
      nombre,
      webhookUrl: String(webhookUrl).trim(),
      apiToken: generarToken(),
      canalId: canalId ? BigInt(canalId) : null,
      activo: activo ?? true
    }
  });
  return NextResponse.json({ ok: true, id: bot.id.toString(), apiToken: bot.apiToken });
}
