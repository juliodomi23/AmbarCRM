import { NextRequest } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { regenerarToken } from "@/lib/servidores-db";
import { idDeRuta, noEncontrado, respuestaNegocio, type PropsId } from "@/lib/rutas-edicion";

export const POST = conModulo("servidores", {}, async (sesion, _req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  if (id === null) return noEncontrado();
  try { return Response.json(await regenerarToken(sesion.orgId!, id), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return respuestaNegocio(error); }
});
