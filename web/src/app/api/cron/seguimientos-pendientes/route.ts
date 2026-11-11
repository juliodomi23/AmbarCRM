import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api-auth";
import { seguimientosDeLaEmpresa, type Seguimientos } from "@/lib/seguimientos-db";
import { dbRaw, runWithOrg } from "@/lib/db";

export const dynamic = "force-dynamic";

type Empresa = { orgId: string; nombre: string; slug: string } & Seguimientos;

/** Tareas vencidas/para hoy y oportunidades estancadas, por empresa. Solo empresas con algo pendiente. */
export async function POST(req: NextRequest) {
  const noAuth = requireApiKey(req);
  if (noAuth) return noAuth;

  const orgs = await dbRaw.$queryRawUnsafe<{ id: bigint; nombre: string; slug: string }[]>(
    "SELECT id, nombre, slug FROM orgs WHERE activo = true",
  );
  const empresas: Empresa[] = [];
  const empresasConError: string[] = [];
  for (const org of orgs) {
    try {
      const datos = await runWithOrg(org.id, () => seguimientosDeLaEmpresa());
      if (datos.tareasVencidas.length || datos.tareasHoy.length || datos.oportunidadesEstancadas.length) {
        empresas.push({ orgId: String(org.id), nombre: org.nombre, slug: org.slug, ...datos });
      }
    } catch (error) {
      empresasConError.push(String(org.id));
      console.error(`[cron/seguimientos-pendientes] org ${org.id}:`, error);
    }
  }
  return NextResponse.json({ ok: true, empresas, empresasConError });
}
