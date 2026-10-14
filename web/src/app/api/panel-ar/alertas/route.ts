import { NextRequest } from "next/server";
import { requireApiKey } from "@/lib/api-auth";
import { requireSesion } from "@/lib/session";
import { dbRaw, runWithOrg } from "@/lib/db";
import { requireModuloActivo, moduloHabilitado } from "@/lib/modulos";
import { ORG_PLATAFORMA } from "@/lib/modulos-plataforma";
import { alertasAR } from "@/lib/alertas-ar-db";

export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  if (req.headers.has("x-api-key")) {
    const denegada = requireApiKey(req);
    if (denegada) return denegada;
    const plataforma = await dbRaw.org.findFirst({ where: { id: ORG_PLATAFORMA, activo: true }, select: { id: true } });
    if (!plataforma) return Response.json({ error: "módulo no activo" }, { status: 404 });
    return runWithOrg(plataforma.id, async () => {
      if (!await moduloHabilitado("panel_ar")) return Response.json({ error: "módulo no activo" }, { status: 404 });
      return Response.json(await alertasAR(plataforma.id), { headers: { "Cache-Control": "no-store" } });
    });
  }
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  if (sesion.orgId !== ORG_PLATAFORMA) return Response.json({ error: "módulo no activo" }, { status: 404 });
  if (sesion.puesto !== "Administrador") return Response.json({ error: "requiere Administrador" }, { status: 403 });
  const denegada = await requireModuloActivo("panel_ar", sesion);
  if (denegada) return denegada;
  return Response.json(await alertasAR(sesion.orgId), { headers: { "Cache-Control": "no-store" } });
}
