import { NextRequest } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { validarContrato } from "@/lib/contratos-cobros";
import { crearContrato } from "@/lib/contratos-db";
import { paginacionListado } from "@/lib/paginacion";
import { respuestaNegocio } from "@/lib/rutas-edicion";
import { serializar } from "@/lib/serialize";

export const GET = conModulo("contratos", {}, async (_sesion, req: NextRequest) =>
  Response.json(serializar({ contratos: await db.contrato.findMany({ ...paginacionListado(req), include: { contacto: { select: { nombre: true } } }, orderBy: { id: "desc" } }) })));

export const POST = conModulo("contratos", {}, async (sesion, req: NextRequest) => {
  const datos = validarContrato(await req.json());
  try { return Response.json(serializar({ contrato: await crearContrato(sesion.orgId!, datos) }), { status: 201 }); }
  catch (error) { return respuestaNegocio(error); }
});
