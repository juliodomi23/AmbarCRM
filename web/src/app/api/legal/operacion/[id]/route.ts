import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conModulo } from "@/lib/con-modulo";
import { serializar } from "@/lib/serialize";
import { fusionar, idDeRuta, noEncontrado, respuestaNegocio, type PropsId } from "@/lib/rutas-edicion";
import { referenciaAjena } from "@/lib/referencias";
import { validarRegistroOperacion } from "@/lib/legal";

/** Cada quien corrige sus propios registros; el administrador, todos. */
function filtro(sesion: { rol?: string; userId: bigint | null }, id: bigint) {
  return { id, ...(sesion.rol === "admin" ? {} : { usuarioId: sesion.userId }) };
}

export const PATCH = conModulo("operacion_legal", {}, async (sesion, req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  const actual = id ? await db.registroOperacionLegal.findFirst({ where: filtro(sesion, id) }) : null;
  if (!id || !actual) return noEncontrado();
  const validacion = validarRegistroOperacion(fusionar(actual, await req.json().catch(() => ({}))));
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  const ajena = await referenciaAjena(validacion.data, { sucursalId: "sucursalLegal" });
  if (ajena) return NextResponse.json({ error: `${ajena} inexistente` }, { status: 400 });
  return NextResponse.json(serializar({ registro: await db.registroOperacionLegal.update({ where: { id }, data: validacion.data }) }));
});

export const DELETE = conModulo("operacion_legal", {}, async (sesion, _req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  if (!id || !(await db.registroOperacionLegal.findFirst({ where: filtro(sesion, id), select: { id: true } }))) {
    return noEncontrado();
  }
  await db.registroOperacionLegal.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
