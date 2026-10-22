import { NextRequest } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { validarFilasCampana } from "@/lib/campanas-envio";

export const POST = conModulo("campanas_envio", {}, async (_sesion, req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  try {
    const resultado = await validarFilasCampana(body.filas, body.mapeo);
    return Response.json({ headers: resultado.headers, conteos: resultado.conteos, muestra: resultado.muestra, rechazadas: resultado.rechazadas });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
});
