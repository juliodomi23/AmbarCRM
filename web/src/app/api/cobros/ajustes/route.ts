import { NextRequest } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { transaccionTenant } from "@/lib/retail-db";

export const PATCH = conModulo("cobros", { admin: true }, async (sesion, req: NextRequest) => {
  const body = await req.json();
  const name = String(body.plantillaNombre ?? "").trim();
  const language = String(body.plantillaIdioma ?? "es_MX").trim();
  if (name && (!/^[a-z0-9_]{1,512}$/.test(name) || !/^[a-z]{2}(?:_[A-Z]{2})?$/.test(language))) return Response.json({ error: "Nombre o idioma de plantilla inválido" }, { status: 400 });
  await transaccionTenant(sesion.orgId!, async (tx) => {
    await tx.$queryRaw`SELECT id FROM modulos_org WHERE clave = 'cobros' FOR UPDATE`;
    const modulo = await tx.moduloOrg.findFirstOrThrow({ where: { clave: "cobros", activo: true } });
    await tx.moduloOrg.update({ where: { id: modulo.id }, data: { config: { ...(modulo.config as object), recordatoriosAutomaticos: false, plantillaCobro: name ? { name, language } : null } } });
  });
  return Response.json({ ok: true });
});
