import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conModulo } from "@/lib/con-modulo";
import { serializar } from "@/lib/serialize";
import { fusionar, idDeRuta, noEncontrado, respuestaNegocio, type PropsId } from "@/lib/rutas-edicion";
import { actualizarInscripcion } from "@/lib/ediciones-db";

const ESTADOS = ["activa", "baja", "terminada"];

export const PATCH = conModulo("inscripciones_academia", {}, async (sesion, req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  if (!id || sesion.orgId === null) return noEncontrado();
  const body = await req.json().catch(() => ({}));
  const cambios: Parameters<typeof actualizarInscripcion>[2] = {};
  if ("estado" in body) {
    if (!ESTADOS.includes(body.estado)) return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
    cambios.estado = body.estado;
  }
  for (const campo of ["avance", "descuento"] as const) {
    if (campo in body) {
      const valor = Number(body[campo]);
      if (!Number.isFinite(valor) || valor < 0 || valor > 100) {
        return NextResponse.json({ error: `${campo} debe estar entre 0 y 100` }, { status: 400 });
      }
      cambios[campo] = campo === "avance" ? Math.round(valor) : valor;
    }
  }
  if ("notas" in body) cambios.notas = String(body.notas ?? "").trim().slice(0, 2000) || null;
  try {
    return NextResponse.json(serializar({ inscripcion: await actualizarInscripcion(sesion.orgId, id, cambios) }));
  } catch (error) {
    return respuestaNegocio(error);
  }
});

export const DELETE = conModulo("inscripciones_academia", {}, async (_sesion, _req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  if (!id || !(await db.inscripcionAcademia.findFirst({ where: { id }, select: { id: true } }))) return noEncontrado();
  await db.inscripcionAcademia.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
