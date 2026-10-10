import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { generarToken, nuevoSecretoFirma } from "@/lib/services/bots";
import { validarWebhookUrl } from "@/lib/webhook-url";
import { referenciaAjena } from "@/lib/referencias";
import { conErrores } from "@/lib/errores-api";

export const dynamic = "force-dynamic";

/** Crea un bot. Body: { nombre, webhookUrl, canalId?, activo? } */
async function manejarPOST(req: NextRequest) {
  const s = await requireSesion(true);
  if ("error" in s) return s.error;

  const { nombre, webhookUrl, canalId, activo } = await req.json().catch(() => ({}));
  if (!nombre || !webhookUrl) return NextResponse.json({ error: "faltan nombre o webhookUrl" }, { status: 400 });
  const errorUrl = validarWebhookUrl(String(webhookUrl));
  if (errorUrl) return NextResponse.json({ error: errorUrl }, { status: 400 });
  const ajena = await referenciaAjena({ canalId }, { canalId: "canal" });
  if (ajena) return NextResponse.json({ error: `${ajena} inexistente` }, { status: 400 });

  const secreto = nuevoSecretoFirma();
  const bot = await db.bot.create({
    data: {
      signingSecret: secreto.cifrado,
      nombre,
      webhookUrl: String(webhookUrl).trim(),
      apiToken: generarToken(),
      canalId: canalId ? BigInt(canalId) : null,
      activo: activo ?? true
    }
  });
  // El secreto de firma se muestra solo aquí; después ya no hay forma de leerlo (solo regenerarlo).
  return NextResponse.json({ ok: true, id: bot.id.toString(), apiToken: bot.apiToken, signingSecret: secreto.plano });
}

export const POST = conErrores(manejarPOST);
