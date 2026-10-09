import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conModulo } from "@/lib/con-modulo";
import { serializar } from "@/lib/serialize";
import { fusionar, idDeRuta, noEncontrado, respuestaNegocio, type PropsId } from "@/lib/rutas-edicion";
import { validarSucursalLegal } from "@/lib/legal";

/** Las sucursales no se borran (tienen historial): se desactivan con { activa: false }. */
export const PATCH = conModulo("operacion_legal", { admin: true }, async (_sesion, req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  const actual = id ? await db.sucursalLegal.findFirst({ where: { id } }) : null;
  if (!id || !actual) return noEncontrado();
  const body = await req.json().catch(() => ({}));
  const validacion = validarSucursalLegal(fusionar(actual, body));
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  const activa = typeof body.activa === "boolean" ? body.activa : body.activa === "false" ? false : body.activa === "true" ? true : actual.activa;
  return NextResponse.json(serializar({ sucursal: await db.sucursalLegal.update({ where: { id }, data: { ...validacion.data, activa } }) }));
});
