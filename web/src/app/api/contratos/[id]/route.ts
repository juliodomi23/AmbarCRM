import { NextRequest } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { idDeRuta, noEncontrado, respuestaNegocio, type PropsId } from "@/lib/rutas-edicion";
import { editarContrato } from "@/lib/contratos-db";
import { serializar } from "@/lib/serialize";
import { requireModuloActivo } from "@/lib/modulos";

export const GET = conModulo("contratos", {}, async (_sesion, _req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  if (!id) return noEncontrado();
  const contrato = await db.contrato.findFirst({ where: { id }, include: { contacto: { select: { nombre: true } }, cobros: true } });
  return contrato ? Response.json(serializar({ contrato })) : noEncontrado();
});

export const PATCH = conModulo("contratos", {}, async (sesion, req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  if (!id) return noEncontrado();
  const datos = await req.json();
  if (datos && Object.hasOwn(datos, "servidorId")) {
    const denegada = await requireModuloActivo("servidores", sesion);
    if (denegada) return denegada;
  }
  try { return Response.json(serializar({ contrato: await editarContrato(sesion.orgId!, id, datos, sesion.rol === "admin") })); }
  catch (error) { return respuestaNegocio(error); }
});
