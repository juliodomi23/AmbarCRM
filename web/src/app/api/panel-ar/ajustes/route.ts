import { NextRequest } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { configPanelAR } from "@/lib/contratos-cobros";
import { transaccionTenant } from "@/lib/retail-db";

export const PATCH = conModulo("panel_ar", { admin: true }, async (sesion, req: NextRequest) => {
  const config = configPanelAR(await req.json());
  await transaccionTenant(sesion.orgId!, async (tx) => {
    await tx.$queryRaw`SELECT id FROM modulos_org WHERE clave = 'panel_ar' FOR UPDATE`;
    const modulo = await tx.moduloOrg.findFirstOrThrow({ where: { clave: "panel_ar", activo: true } });
    await tx.moduloOrg.update({ where: { id: modulo.id }, data: { config: { ...(modulo.config as object), proyectoCtoPct: config.proyectoCtoPct.toString(), mensualidadCtoPct: config.mensualidadCtoPct.toString(), credito_ia_mxn: config.creditoIA.toString() } } });
  });
  return Response.json({ ok: true });
});
