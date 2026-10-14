import { NextRequest } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { crearCobro, incluirContrato } from "@/lib/cobros-db";
import { paginacionListado } from "@/lib/paginacion";
import { respuestaNegocio } from "@/lib/rutas-edicion";
import { serializar } from "@/lib/serialize";

export const GET = conModulo("cobros", {}, async (_sesion, req: NextRequest) => {
  const contratoId = req.nextUrl.searchParams.get("contratoId");
  if (contratoId && !/^\d+$/.test(contratoId)) return Response.json({ error: "Contrato inválido" }, { status: 400 });
  return Response.json(serializar({ cobros: await db.cobro.findMany({ ...paginacionListado(req), where: contratoId ? { contratoId: BigInt(contratoId) } : {}, include: incluirContrato, orderBy: { id: "desc" } }) }));
});

export const POST = conModulo("cobros", {}, async (sesion, req: NextRequest) => {
  const body = await req.json();
  try { return Response.json(serializar({ cobro: await crearCobro(sesion.orgId!, body) }), { status: 201 }); }
  catch (error) { return respuestaNegocio(error); }
});
