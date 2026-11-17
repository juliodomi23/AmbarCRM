import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api-auth";
import { dbRaw } from "@/lib/db";
import { transaccionTenant } from "@/lib/retail-db";
import { sincronizarInsightsOrg } from "@/lib/meta-ads/servicio";

export const dynamic = "force-dynamic";

/**
 * Cron de Meta Ads: recorre TODAS las organizaciones activas con conexión de Meta Ads
 * activa y sincroniza sus insights. Se autentica solo con la API key interna (x-api-key),
 * igual que /api/cron/calendario; no depende de una sesión de NextAuth.
 */
export async function POST(req: NextRequest) {
  const noAutorizado = requireApiKey(req);
  if (noAutorizado) return noAutorizado;

  const orgs = await dbRaw.org.findMany({ where: { activo: true }, select: { id: true } });
  let sincronizados = 0; let sinConexion = 0; let errores = 0;

  for (const org of orgs) {
    try {
      // RLS exige el tenant fijado (app.current_org); lo hacemos con transaccionTenant.
      const conexion = await transaccionTenant(org.id, (tx) =>
        tx.metaAdsConexion.findFirst({ where: { estado: "activa" }, select: { adAccountId: true } }),
      );
      if (!conexion) { sinConexion++; continue; }
      // Si la conexión sigue con el placeholder "<temp>" (el usuario aún debe elegir su cuenta), no sincronizar.
      if (conexion.adAccountId === "<temp>") { sinConexion++; continue; }
      await sincronizarInsightsOrg(org.id, conexion.adAccountId);
      sincronizados++;
    } catch { errores++; }
  }

  return NextResponse.json(
    { ok: errores === 0, organizaciones: orgs.length, sincronizados, sinConexion, errores },
    { status: errores ? 207 : 200 },
  );
}
