import { NextRequest } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { validarFilasCampana } from "@/lib/campanas-envio";

export const POST = conModulo("campanas_envio", {}, async (_sesion, req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  try {
    const variables = Array.isArray(body.mapeoVariables) ? body.mapeoVariables.map(String) : [];
    const resultado = await validarFilasCampana(body.filas, body.mapeo, variables);
    return Response.json({ headers: resultado.headers, conteos: resultado.conteos, muestra: resultado.muestra, rechazadas: resultado.rechazadas });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
});
