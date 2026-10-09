import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conModulo } from "@/lib/con-modulo";
import { serializar } from "@/lib/serialize";
import { fusionar, idDeRuta, noEncontrado, respuestaNegocio, type PropsId } from "@/lib/rutas-edicion";
import { validarAlumno } from "@/lib/academia";

export const PATCH = conModulo("alumnos", {}, async (_sesion, req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  const actual = id ? await db.alumnoAcademia.findFirst({ where: { id } }) : null;
  if (!id || !actual) return noEncontrado();
  const body = await req.json().catch(() => ({}));
  delete body.contactoId;
  const validacion = validarAlumno(fusionar(actual, body));
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  const { contactoId: _mismo, ...datos } = validacion.data;
  return NextResponse.json(serializar({ alumno: await db.alumnoAcademia.update({ where: { id }, data: datos }) }));
});

export const DELETE = conModulo("alumnos", {}, async (_sesion, _req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  if (!id || !(await db.alumnoAcademia.findFirst({ where: { id }, select: { id: true } }))) return noEncontrado();
  const [inscripciones, colegiaturas] = await Promise.all([
    db.inscripcionAcademia.count({ where: { alumnoId: id } }),
    db.colegiaturaAcademia.count({ where: { alumnoId: id } }),
  ]);
  if (inscripciones || colegiaturas) {
    return NextResponse.json({ error: "El alumno tiene historial: cámbialo a «Baja» en lugar de borrarlo" }, { status: 409 });
  }
  await db.alumnoAcademia.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
