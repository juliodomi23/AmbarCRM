import { NextRequest } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { editarServidor } from "@/lib/servidores-db";
import { idDeRuta, noEncontrado, respuestaNegocio, type PropsId } from "@/lib/rutas-edicion";
import { serializar } from "@/lib/serialize";

export const PATCH = conModulo("servidores", {}, async (sesion, req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  if (id === null) return noEncontrado();
  try { return Response.json({ servidor: serializar(await editarServidor(sesion.orgId!, id, await req.json())) }); }
  catch (error) { return respuestaNegocio(error); }
});
