import { NextRequest } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { recordarCobro } from "@/lib/cobros-envio";
import { idDeRuta, noEncontrado, respuestaNegocio, type PropsId } from "@/lib/rutas-edicion";

export const POST = conModulo("cobros", {}, async (_sesion, _req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  if (!id) return noEncontrado();
  try { return Response.json(await recordarCobro(id)); }
  catch (error) { return respuestaNegocio(error); }
});
