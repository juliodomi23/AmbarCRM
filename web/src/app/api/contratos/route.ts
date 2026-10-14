import { NextRequest } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { validarContrato } from "@/lib/contratos-cobros";
import { crearContrato } from "@/lib/contratos-db";
import { paginacionListado } from "@/lib/paginacion";
import { respuestaNegocio } from "@/lib/rutas-edicion";
import { serializar } from "@/lib/serialize";
import { filtroContratosAR } from "@/lib/ar-vistas";

export const GET = conModulo("contratos", {}, async (_sesion, req: NextRequest) => {
  const where = filtroContratosAR(req.nextUrl.searchParams.get("bajas") === "1", (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0,100));
  const [contratos,total] = await Promise.all([db.contrato.findMany({ ...paginacionListado(req), where, include: { contacto: { select: { nombre: true } } }, orderBy: { id: "desc" } }), db.contrato.count({ where })]);
  return Response.json(serializar({ contratos,total }));
});

export const POST = conModulo("contratos", {}, async (sesion, req: NextRequest) => {
  const datos = validarContrato(await req.json());
  try { return Response.json(serializar({ contrato: await crearContrato(sesion.orgId!, datos) }), { status: 201 }); }
  catch (error) { return respuestaNegocio(error); }
});
