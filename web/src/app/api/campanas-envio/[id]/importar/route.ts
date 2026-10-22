import { NextRequest } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { aceptarListaCampana } from "@/lib/campanas-envio-importar";

type Props = { params: Promise<{ id: string }> };

export const POST = conModulo("campanas_envio", { admin: true }, async (sesion, req: NextRequest, { params }: Props) => {
  const id = BigInt((await params).id);
  const campana = await db.campanaEnvio.findFirst({ where: { id, estado: "borrador" } });
  if (!campana || sesion.orgId === null || !sesion.userId) return Response.json({ error: "Campaña en borrador inexistente" }, { status: 404 });
  if (campana.listaAceptadaAt) return Response.json({ error: "La lista de esta campaña ya fue aceptada" }, { status: 409 });
  const body = await req.json().catch(() => ({}));
  const variables = Array.isArray(campana.mapeoVariables) ? campana.mapeoVariables.map(String) : [];
  let etiquetaId: bigint | null = null;
  if (body.etiquetaId) {
    try { etiquetaId = BigInt(body.etiquetaId); } catch { return Response.json({ error: "Etiqueta inválida" }, { status: 400 }); }
  }
  if (etiquetaId && !(await db.etiqueta.findFirst({ where: { id: etiquetaId } }))) return Response.json({ error: "Etiqueta inexistente" }, { status: 400 });
  try {
    const resultado = await aceptarListaCampana(sesion.orgId, id, sesion.userId, { filas: body.filas, filaEncabezados: body.filaEncabezados, mapeo: body.mapeo, mapeoVariables: variables, areasSeleccionadas: body.areasSeleccionadas, filasAceptadas: body.filasAceptadas, filtroGiro: String(body.filtroGiro ?? ""), etiquetaId });
    return Response.json(resultado);
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
});
