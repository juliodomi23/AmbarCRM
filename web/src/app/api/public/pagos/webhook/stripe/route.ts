import { NextRequest, NextResponse } from "next/server";
import { db, dbRaw, runWithOrg } from "@/lib/db";
import { leerEventoStripeFirmado } from "@/lib/pagos/stripe";
import { POST as procesarWebhookPorOrg } from "@/app/api/public/pagos/webhook/[proveedor]/[org]/route";

export const dynamic = "force-dynamic";

async function buscarOrgPorCuentaStripe(accountId: string) {
  const coincidencias = await dbRaw.$queryRaw<{ org_id: bigint }[]>`
    SELECT org_id FROM resolve_org_by_stripe_account(${accountId})`;
  return coincidencias.length === 1 ? coincidencias[0].org_id : null;
}

export async function POST(req: NextRequest) {
  let evento;
  try {
    evento = await leerEventoStripeFirmado(req.clone());
  } catch (error) {
    const invalida = error instanceof Error && error.message === "firma de webhook inválida";
    return NextResponse.json({ error: invalida ? "firma de webhook inválida" : "payload de webhook inválido" }, { status: invalida ? 401 : 400 });
  }
  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (typeof evento.livemode === "boolean" && (evento.livemode !== stripeKey.startsWith("sk_live_")))
    return NextResponse.json({ ok: true, ignorado: true, motivo: "modo de Stripe distinto al configurado" });
  const accountId = evento.account;
  if (!accountId || !/^acct_[A-Za-z0-9]+$/.test(accountId)) return NextResponse.json({ error: "cuenta conectada inválida" }, { status: 400 });
  try {
    const orgId = await buscarOrgPorCuentaStripe(accountId);
    if (orgId === null) return NextResponse.json({ error: "cuenta conectada no registrada" }, { status: 404 });
    return procesarWebhookPorOrg(req, { params: Promise.resolve({ proveedor: "stripe", org: String(orgId) }) });
  } catch {
    return NextResponse.json({ error: "no se pudo enrutar el evento Connect" }, { status: 500 });
  }
}
