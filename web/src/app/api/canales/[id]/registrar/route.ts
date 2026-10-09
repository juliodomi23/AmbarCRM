import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { tokenFromChannelConfig } from "@/lib/meta/credentials";
import { registrarNumero } from "@/lib/meta/registro";
import { conErrores } from "@/lib/errores-api";

export const dynamic = "force-dynamic";

/** Activa en Cloud API un número ya conectado que quedó sin registrar. */
async function manejarPOST(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await requireSesion(true);
  if ("error" in s) return s.error;

  const canal = await db.canalWhatsapp.findUnique({ where: { id: BigInt(params.id) } });
  if (!canal) return NextResponse.json({ error: "canal inexistente" }, { status: 404 });
  const config = (canal.config || {}) as Record<string, unknown>;
  const phoneNumberId = typeof config.phoneNumberId === "string" ? config.phoneNumberId : "";
  const token = tokenFromChannelConfig(config);
  if (!phoneNumberId || !token) return NextResponse.json({ error: "canal sin credenciales Meta" }, { status: 400 });

  const registro = await registrarNumero(phoneNumberId, token);
  if (registro.error) return NextResponse.json({ error: registro.error }, { status: 502 });

  await db.canalWhatsapp.update({
    where: { id: canal.id },
    data: { config: { ...config, onboardingMode: "cloud_api", pinEncrypted: registro.pinEncrypted } }
  });
  return NextResponse.json({ ok: true });
}

export const POST = conErrores(manejarPOST);
