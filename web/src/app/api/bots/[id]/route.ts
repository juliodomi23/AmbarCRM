import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { generarToken, nuevoSecretoFirma } from "@/lib/services/bots";
import { validarWebhookUrl } from "@/lib/webhook-url";
import { referenciaPropia } from "@/lib/referencias";
import { conErrores } from "@/lib/errores-api";
import { permisosValidos } from "@/lib/bot-permisos";

export const dynamic = "force-dynamic";

/** Edita un bot. Body: { nombre?, webhookUrl?, canalId?, activo?, asesorId?, permisos?, regenerarToken?, regenerarSecreto? } */
async function manejarPATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await requireSesion(true);
  if ("error" in s) return s.error;

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.nombre === "string") data.nombre = body.nombre;
  if (typeof body.webhookUrl === "string") {
    const errorUrl = validarWebhookUrl(body.webhookUrl);
    if (errorUrl) return NextResponse.json({ error: errorUrl }, { status: 400 });
    data.webhookUrl = body.webhookUrl.trim();
  }
  if (typeof body.activo === "boolean") data.activo = body.activo;
  if ("canalId" in body) {
    const canalId = await referenciaPropia("canal", body.canalId);
    if (canalId === false) return NextResponse.json({ error: "canal inexistente" }, { status: 400 });
    data.canalId = canalId;
  }
  if ("asesorId" in body) {
    const asesorId = await referenciaPropia("usuario", body.asesorId);
    if (asesorId === false) return NextResponse.json({ error: "asesor inexistente" }, { status: 400 });
    data.asesorId = asesorId;
  }
  if ("permisos" in body) {
    const permisos = permisosValidos(body.permisos);
    if (permisos === null) return NextResponse.json({ error: "permisos inválidos" }, { status: 400 });
    data.permisos = permisos;
  }
  if (body.regenerarToken === true) data.apiToken = generarToken();
  const secreto = body.regenerarSecreto === true ? nuevoSecretoFirma() : null;
  if (secreto) data.signingSecret = secreto.cifrado;

  const bot = await db.bot.update({ where: { id: BigInt(params.id) }, data });
  // El secreto en claro solo viaja en la respuesta que lo genera.
  return NextResponse.json({ ok: true, apiToken: bot.apiToken, ...(secreto ? { signingSecret: secreto.plano } : {}) });
}

async function manejarDELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await requireSesion(true);
  if ("error" in s) return s.error;
  await db.bot.delete({ where: { id: BigInt(params.id) } });
  return NextResponse.json({ ok: true });
}

export const PATCH = conErrores(manejarPATCH);
export const DELETE = conErrores(manejarDELETE);
