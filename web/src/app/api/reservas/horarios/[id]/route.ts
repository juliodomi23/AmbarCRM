import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conModulo } from "@/lib/con-modulo";
import { idDeRuta, noEncontrado, type PropsId } from "@/lib/rutas-edicion";

export const DELETE = conModulo("reservas_en_linea", { admin: true }, async (_sesion, _req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  if (!id || !(await db.horarioDoctor.findFirst({ where: { id }, select: { id: true } }))) return noEncontrado();
  await db.horarioDoctor.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
