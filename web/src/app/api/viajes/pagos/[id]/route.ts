import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conModulo } from "@/lib/con-modulo";
import { serializar } from "@/lib/serialize";
import { fusionar, idDeRuta, noEncontrado, respuestaNegocio, type PropsId } from "@/lib/rutas-edicion";
import { cancelarPagoTour } from "@/lib/ediciones-db";

/** Body: { estado: "cancelado" } devuelve el monto al saldo; o { metodo, referencia } para corregir datos. */
export const PATCH = conModulo("pagos_tours", {}, async (sesion, req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  if (!id || sesion.orgId === null || !(await db.pagoTour.findFirst({ where: { id }, select: { id: true } }))) {
    return noEncontrado();
  }
  const body = await req.json().catch(() => ({}));
  try {
    if (body.estado === "cancelado") await cancelarPagoTour(sesion.orgId, id);
  } catch (error) {
    return respuestaNegocio(error);
  }
  const datos: { metodo?: string | null; referencia?: string | null; concepto?: string } = {};
  if ("metodo" in body) datos.metodo = String(body.metodo ?? "").trim().slice(0, 80) || null;
  if ("referencia" in body) datos.referencia = String(body.referencia ?? "").trim().slice(0, 160) || null;
  if (typeof body.concepto === "string" && body.concepto.trim()) datos.concepto = body.concepto.trim().slice(0, 200);
  const pago = await db.pagoTour.update({ where: { id }, data: datos });
  return NextResponse.json(serializar({ pago }));
});
