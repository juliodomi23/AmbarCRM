import { NextRequest } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { cambiarCobro, incluirContrato } from "@/lib/cobros-db";
import { idDeRuta, noEncontrado, respuestaNegocio, type PropsId } from "@/lib/rutas-edicion";
import { serializar } from "@/lib/serialize";

export const GET = conModulo("cobros", {}, async (_sesion, _req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  if (!id) return noEncontrado();
  const cobro = await db.cobro.findFirst({ where: { id }, include: incluirContrato });
  return cobro ? Response.json(serializar({ cobro })) : noEncontrado();
});
export const PATCH = conModulo("cobros", {}, async (sesion, req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  if (!id) return noEncontrado();
  const body = await req.json();
  try { return Response.json(serializar(await cambiarCobro(sesion.orgId!, id, body, sesion.rol === "admin"))); }
  catch (error) { return respuestaNegocio(error); }
});
