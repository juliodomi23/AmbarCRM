import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api-auth";
import { dbRaw } from "@/lib/db";
import { transaccionTenant } from "@/lib/retail-db";
import { sincronizarInsightsOrg } from "@/lib/meta-ads/servicio";

export const dynamic = "force-dynamic";

/**
 * Cron de Meta Ads: recorre TODOS los clientes de TODAS las organizaciones activas con conexión activa
 * de Meta Ads y sincroniza sus insights. Se autentica solo con la API key interna (x-api-key),
 * igual que /api/cron/calendario; no depende de una sesión de NextAuth.
 */
export async function POST(req: NextRequest) {
  const noAutorizado = requireApiKey(req);
  if (noAutorizado) return noAutorizado;

  const orgs = await dbRaw.org.findMany({ where: { activo: true }, select: { id: true } });
  let sincronizados = 0; let sinConexion = 0; let errores = 0;

  for (const org of orgs) {
    try {
      // Listar clientes activos
      const clientes = await transaccionTenant(org.id, (tx) =>
        tx.metaAdsCliente.findMany({
          where: { orgId: org.id, activo: true },
          select: { id: true },
        }),
      );
      if (clientes.length === 0) continue;

      for (const cliente of clientes) {
        const conexion = await transaccionTenant(org.id, (tx) =>
          tx.metaAdsConexion.findFirst({ where: { orgId: org.id, clienteId: cliente.id, estado: "activa" }, select: { adAccountId: true } }),
        );
        if (!conexion) { sinConexion++; continue; }
        if (conexion.adAccountId === "<temp>") { sinConexion++; continue; }
        await sincronizarInsightsOrg(org.id, cliente.id, conexion.adAccountId);
        sincronizados++;
      }
    } catch (error) {
      errores++;
      console.error(`CRON meta-ads: error en org ${org.id}:`, error);
    }
  }

  return NextResponse.json(
    { ok: errores === 0, organizaciones: orgs.length, sincronizados, sinConexion, errores },
    { status: errores ? 207 : 200 },
  );
}