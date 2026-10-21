import { NextRequest } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { cambiarCampana, obtenerCampana, respuestaErrorMarketing } from "@/lib/marketing-db";
import { idDeRuta, noEncontrado, type PropsId } from "@/lib/rutas-edicion";

export const dynamic = "force-dynamic";

export const GET = conModulo("meta_ads", {}, async (sesion, _req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  if (id === null) return noEncontrado();
  try {
    return Response.json({ campana: await obtenerCampana(sesion, "meta_ads", id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return respuestaErrorMarketing(error); }
});

export const PATCH = conModulo("meta_ads", {}, async (sesion, req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  if (id === null) return noEncontrado();
  try {
    return Response.json({ campana: await cambiarCampana(sesion, "meta_ads", id, await req.json()) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return respuestaErrorMarketing(error); }
});
