import { NextRequest, NextResponse } from "next/server";
import { validarInscripcion } from "@/lib/academia";
import { ErrorCupo, inscribirAlumnoConCupo } from "@/lib/cupos-db";
import { requireModuloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { requireSesion } from "@/lib/session";

export async function POST(req: NextRequest) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const apagado = await requireModuloActivo("inscripciones_academia");
  if (apagado) return apagado;
  if (sesion.orgId === null) {
    return NextResponse.json({ error: "Organización no disponible" }, { status: 400 });
  }
  const validacion = validarInscripcion(await req.json().catch(() => ({})));
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  try {
    const inscripcion = await inscribirAlumnoConCupo(sesion.orgId, validacion.data);
    return NextResponse.json(serializar({ inscripcion }), { status: 201 });
  } catch (error) {
    if (error instanceof ErrorCupo) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
