import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conModulo } from "@/lib/con-modulo";
import { serializar } from "@/lib/serialize";
import { fusionar, idDeRuta, noEncontrado, respuestaNegocio, type PropsId } from "@/lib/rutas-edicion";
import { validarTour } from "@/lib/viajes";
import { actualizarTour } from "@/lib/ediciones-db";

export const PATCH = conModulo("tours", {}, async (sesion, req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  const actual = id ? await db.tour.findFirst({ where: { id } }) : null;
  if (!id || !actual || sesion.orgId === null) return noEncontrado();
  const validacion = validarTour(fusionar(actual, await req.json().catch(() => ({}))));
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  try {
    return NextResponse.json(serializar({ tour: await actualizarTour(sesion.orgId, id, validacion.data) }));
  } catch (error) {
    return respuestaNegocio(error);
  }
});

export const DELETE = conModulo("tours", {}, async (_sesion, _req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  if (!id || !(await db.tour.findFirst({ where: { id }, select: { id: true } }))) return noEncontrado();
  if (await db.reservaTour.count({ where: { tourId: id } })) {
    return NextResponse.json({ error: "El tour tiene reservas: cámbialo a «Cerrado» en lugar de borrarlo" }, { status: 409 });
  }
  await db.tour.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
