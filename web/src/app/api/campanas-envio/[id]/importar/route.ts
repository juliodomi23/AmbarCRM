import { NextRequest } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { validarFilasCampana } from "@/lib/campanas-envio";
import { guardarFilasCampana } from "@/lib/campanas-envio-importar";

type Props = { params: Promise<{ id: string }> };

export const POST = conModulo("campanas_envio", { admin: true }, async (sesion, req: NextRequest, { params }: Props) => {
  const id = BigInt((await params).id);
  const campana = await db.campanaEnvio.findFirst({ where: { id, estado: "borrador" } });
  if (!campana || sesion.orgId === null) return Response.json({ error: "Campaña en borrador inexistente" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const variables = Array.isArray(campana.mapeoVariables) ? campana.mapeoVariables.map(String) : [];
  let resultado;
  try { resultado = await validarFilasCampana(body.filas, body.mapeo, variables); } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
  const filtroGiro = String(body.filtroGiro ?? "").trim().toLocaleLowerCase("es-MX");
  let etiquetaId: bigint | null = null;
  if (body.etiquetaId) {
    try { etiquetaId = BigInt(body.etiquetaId); } catch { return Response.json({ error: "Etiqueta inválida" }, { status: 400 }); }
  }
  if (etiquetaId && !(await db.etiqueta.findFirst({ where: { id: etiquetaId } }))) return Response.json({ error: "Etiqueta inexistente" }, { status: 400 });
  const importados = await guardarFilasCampana(sesion.orgId, id, resultado.aceptadas, filtroGiro, etiquetaId);
  return Response.json({ importados, conteos: resultado.conteos, rechazadas: resultado.rechazadas });
});
