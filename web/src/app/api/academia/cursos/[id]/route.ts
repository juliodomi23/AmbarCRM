import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conModulo } from "@/lib/con-modulo";
import { serializar } from "@/lib/serialize";
import { fusionar, idDeRuta, noEncontrado, respuestaNegocio, type PropsId } from "@/lib/rutas-edicion";
import { validarCurso } from "@/lib/academia";
import { actualizarCurso } from "@/lib/ediciones-db";

export const PATCH = conModulo("cursos_academia", {}, async (sesion, req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  const actual = id ? await db.cursoAcademia.findFirst({ where: { id } }) : null;
  if (!id || !actual || sesion.orgId === null) return noEncontrado();
  const validacion = validarCurso(fusionar(actual, await req.json().catch(() => ({}))));
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  try {
    return NextResponse.json(serializar({ curso: await actualizarCurso(sesion.orgId, id, validacion.data) }));
  } catch (error) {
    return respuestaNegocio(error);
  }
});

export const DELETE = conModulo("cursos_academia", {}, async (_sesion, _req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  if (!id || !(await db.cursoAcademia.findFirst({ where: { id }, select: { id: true } }))) return noEncontrado();
  if (await db.inscripcionAcademia.count({ where: { cursoId: id } })) {
    return NextResponse.json({ error: "El curso tiene inscripciones: cámbialo a «Cerrado» en lugar de borrarlo" }, { status: 409 });
  }
  await db.cursoAcademia.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
