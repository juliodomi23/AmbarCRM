import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { getProvider } from "@/lib/channel";
import { instanciaPorDefecto } from "@/lib/channel/evolution";

export const dynamic = "force-dynamic";

/**
 * Crea la instancia (si hace falta) y devuelve el QR/código para vincular el número.
 * No recibe body. Persiste el nombre de la instancia si el canal no tenía uno.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await requireSesion(true);
  if ("error" in s) return s.error;

  const canal = await db.canalWhatsapp.findUnique({ where: { id: BigInt(params.id) } });
  if (!canal) return NextResponse.json({ error: "canal inexistente" }, { status: 404 });

  const provider = getProvider(canal.proveedor);
  if (!provider.conectar) {
    return NextResponse.json(
      { error: "este proveedor no se vincula por QR (usa token, ver INTEGRACION-N8N.md)" },
      { status: 400 }
    );
  }

  const instancia = canal.instancia?.trim() || instanciaPorDefecto;
  const res = await provider.conectar(instancia);

  // Configura el webhook de Evolution → CRM para recibir mensajes (clave: sin esto no llegan entrantes).
  if (res.ok && provider.configurarWebhook) {
    const base = process.env.NEXTAUTH_URL ?? "";
    const apiKey = process.env.WA_API_KEY ?? "";
    if (base && apiKey) {
      const url = `${base.replace(/\/$/, "")}/api/wa/webhook?canal=${canal.id}&apikey=${encodeURIComponent(apiKey)}`;
      await provider.configurarWebhook(instancia, url, apiKey);
    }
  }

  const data: Record<string, unknown> = {};
  if (!canal.instancia?.trim()) data.instancia = instancia;
  if (res.estado === "conectado") data.estado = "conectado";
  if (Object.keys(data).length) await db.canalWhatsapp.update({ where: { id: canal.id }, data });

  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 502 });
  return NextResponse.json({
    ok: true,
    estado: res.estado,
    qrBase64: res.qrBase64,
    pairingCode: res.pairingCode,
    telefono: res.telefono
  });
}
