import { NextRequest } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { filtrarFilasCampana, resumirMatrizAreaZona, validarFilasCampana } from "@/lib/campanas-envio";
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
    const filtradas = await filtrarFilasCampana(resultado.aceptadas, String(body.filtroGiro ?? ""), etiquetaId, String(body.filtroZona ?? ""));
    const aceptadas = filtradas.map(({ numeroFila, telefono, nombre, empresa, giro, areaClave, ciudad, zonaClave }) => ({ numeroFila, telefono, nombre, empresa, giro, areaClave, ciudad, zonaClave }));
    const porArea = new Map<string, number>();
    const porZona = new Map<string, number>();
    for (const fila of filtradas) {
      porArea.set(fila.areaClave, (porArea.get(fila.areaClave) ?? 0) + 1);
      if (resultado.tieneZona) porZona.set(fila.zonaClave, (porZona.get(fila.zonaClave) ?? 0) + 1);
    }
    const resumenAreas = resultado.resumenAreas.map((area) => {
      const validos = porArea.get(area.clave) ?? 0;
      return { ...area, validos, fueraDeFiltro: area.validos - validos };
    });
    const resumenZonas = resultado.resumenZonas.map((zona) => {
      const validos = porZona.get(zona.clave) ?? 0;
      return { ...zona, validos, fueraDeFiltro: zona.validos - validos };
    });
    return Response.json({ filaEncabezados: archivo.filaEncabezados, headers: resultado.headers, conteos: resultado.conteos, muestra: resultado.muestra, rechazadas: resultado.rechazadas, resumenAreas, resumenZonas, matrizAreaZona: resumirMatrizAreaZona(filtradas), tieneZona: resultado.tieneZona, aceptadas });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
});
