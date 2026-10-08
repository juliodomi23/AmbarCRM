import { NextRequest, NextResponse } from "next/server";
import { validarColegiatura } from "@/lib/academia";
import { ErrorCupo, registrarColegiaturaIdempotente } from "@/lib/cupos-db";
import { serializar } from "@/lib/serialize";
import { conModulo } from "@/lib/con-modulo";
import { referenciaAjena } from "@/lib/referencias";

export const POST = conModulo("colegiaturas", {}, async (sesion, req: NextRequest) => {
  if (sesion.orgId === null) {
    return NextResponse.json({ error: "Organización no disponible" }, { status: 400 });
  }
  const validacion = validarColegiatura(await req.json().catch(() => ({})));
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  const ajena = await referenciaAjena(validacion.data, { alumnoId: "alumno", inscripcionId: "inscripcion" });
  if (ajena) return NextResponse.json({ error: `${ajena} inexistente` }, { status: 400 });
  try {
    const colegiatura = await registrarColegiaturaIdempotente(sesion.orgId, validacion.data);
    return NextResponse.json(serializar({ colegiatura }), { status: 201 });
  } catch (error) {
    if (error instanceof ErrorCupo) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
});
