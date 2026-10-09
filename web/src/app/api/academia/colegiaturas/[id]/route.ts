import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conModulo } from "@/lib/con-modulo";
import { serializar } from "@/lib/serialize";
import { fusionar, idDeRuta, noEncontrado, respuestaNegocio, type PropsId } from "@/lib/rutas-edicion";
import { validarColegiatura } from "@/lib/academia";

export const PATCH = conModulo("colegiaturas", {}, async (_sesion, req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  const actual = id ? await db.colegiaturaAcademia.findFirst({ where: { id } }) : null;
  if (!id || !actual) return noEncontrado();
  const body = await req.json().catch(() => ({}));
  delete body.alumnoId;
  delete body.inscripcionId;
  const validacion = validarColegiatura(fusionar(actual, body));
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  const { alumnoId: _a, inscripcionId: _i, ...datos } = validacion.data;
  return NextResponse.json(serializar({ colegiatura: await db.colegiaturaAcademia.update({ where: { id }, data: datos }) }));
});

export const DELETE = conModulo("colegiaturas", {}, async (_sesion, _req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  const actual = id ? await db.colegiaturaAcademia.findFirst({ where: { id }, select: { estado: true } }) : null;
  if (!id || !actual) return noEncontrado();
  if (actual.estado === "pagada") {
    return NextResponse.json({ error: "Una colegiatura pagada no se borra" }, { status: 409 });
  }
  await db.colegiaturaAcademia.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
