import { NextRequest } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { filtrarFilasCampana, validarFilasCampana } from "@/lib/campanas-envio";
import { prepararArchivoCampana } from "@/lib/campanas-envio-archivo";

export const POST = conModulo("campanas_envio", {}, async (_sesion, req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  try {
    const archivo = prepararArchivoCampana(body.filas, body.filaEncabezados);
    const variables = Array.isArray(body.mapeoVariables) ? body.mapeoVariables.map(String) : [];
    const resultado = await validarFilasCampana(body.filas, body.mapeo, variables, archivo.filaEncabezados);
    let etiquetaId: bigint | null = null;
    if (body.etiquetaId) {
      etiquetaId = BigInt(body.etiquetaId);
      if (!(await db.etiqueta.findFirst({ where: { id: etiquetaId } }))) throw new Error("Etiqueta inexistente");
    }
    const filtradas = await filtrarFilasCampana(resultado.aceptadas, String(body.filtroGiro ?? ""), etiquetaId);
    const aceptadas = filtradas.map(({ numeroFila, telefono, nombre, empresa, giro, areaClave, ciudad }) => ({ numeroFila, telefono, nombre, empresa, giro, areaClave, ciudad }));
    const resumenAreas = resultado.resumenAreas.map((area) => {
      const validos = filtradas.filter((fila) => fila.areaClave === area.clave).length;
      return { ...area, validos, fueraDeFiltro: area.validos - validos };
    });
    return Response.json({ filaEncabezados: archivo.filaEncabezados, headers: resultado.headers, conteos: resultado.conteos, muestra: resultado.muestra, rechazadas: resultado.rechazadas, resumenAreas, aceptadas });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
});
