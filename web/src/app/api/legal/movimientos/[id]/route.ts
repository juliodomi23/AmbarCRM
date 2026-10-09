import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conModulo } from "@/lib/con-modulo";
import { serializar } from "@/lib/serialize";
import { fusionar, idDeRuta, noEncontrado, respuestaNegocio, type PropsId } from "@/lib/rutas-edicion";
import { esPasante } from "@/lib/legal";
import { referenciaAjena } from "@/lib/referencias";
import { validarMovimientoLegal } from "@/lib/legal";

/** El pasante solo toca movimientos de expedientes asignados a él. */
function filtro(sesion: { puesto: string; rol?: string; userId: bigint | null }, id: bigint) {
  return { id, ...(esPasante(sesion.puesto, sesion.rol) ? { expediente: { responsableId: sesion.userId } } : {}) };
}

export const PATCH = conModulo("finanzas_legales", {}, async (sesion, req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  const actual = id ? await db.movimientoLegal.findFirst({ where: filtro(sesion, id) }) : null;
  if (!id || !actual) return noEncontrado();
  const validacion = validarMovimientoLegal(fusionar(actual, await req.json().catch(() => ({}))));
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  const ajena = await referenciaAjena(validacion.data, {
    expedienteId: "expedienteLegal", contactoId: "contacto", sucursalId: "sucursalLegal",
  });
  if (ajena) return NextResponse.json({ error: `${ajena} inexistente` }, { status: 400 });
  if (esPasante(sesion.puesto, sesion.rol)) {
    const expedienteId = validacion.data.expedienteId;
    const asignado = expedienteId
      ? await db.expedienteLegal.findFirst({ where: { id: expedienteId, responsableId: sesion.userId }, select: { id: true } })
      : null;
    if (!asignado) return NextResponse.json({ error: "expediente no asignado" }, { status: 403 });
  }
  return NextResponse.json(serializar({ movimiento: await db.movimientoLegal.update({ where: { id }, data: validacion.data }) }));
});

export const DELETE = conModulo("finanzas_legales", {}, async (sesion, _req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  if (!id || !(await db.movimientoLegal.findFirst({ where: filtro(sesion, id), select: { id: true } }))) return noEncontrado();
  await db.movimientoLegal.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
