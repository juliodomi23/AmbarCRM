import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conModulo } from "@/lib/con-modulo";
import { serializar } from "@/lib/serialize";
import { fusionar, idDeRuta, noEncontrado, respuestaNegocio, type PropsId } from "@/lib/rutas-edicion";
const ESTADOS = ["presente", "falta", "retardo", "justificada"];

export const PATCH = conModulo("asistencia_academia", {}, async (_sesion, req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  if (!id || !(await db.asistenciaAcademia.findFirst({ where: { id }, select: { id: true } }))) return noEncontrado();
  const body = await req.json().catch(() => ({}));
  const datos: { estado?: string; notas?: string | null } = {};
  if ("estado" in body) {
    if (!ESTADOS.includes(body.estado)) return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
    datos.estado = body.estado;
  }
  if ("notas" in body) datos.notas = String(body.notas ?? "").trim().slice(0, 1000) || null;
  return NextResponse.json(serializar({ asistencia: await db.asistenciaAcademia.update({ where: { id }, data: datos }) }));
});

export const DELETE = conModulo("asistencia_academia", {}, async (_sesion, _req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  if (!id || !(await db.asistenciaAcademia.findFirst({ where: { id }, select: { id: true } }))) return noEncontrado();
  await db.asistenciaAcademia.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
