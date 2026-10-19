import { NextRequest, NextResponse } from "next/server";
import { quitarHorarioDoctor } from "@/lib/reservas/configuracion";
import { conModulo } from "@/lib/con-modulo";
import { idDeRuta, noEncontrado, type PropsId } from "@/lib/rutas-edicion";

export const DELETE = conModulo("reservas_en_linea", { admin: true }, async (sesion, _req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  if (!id || id > 9223372036854775807n || !(await quitarHorarioDoctor(sesion.orgId!, id, "excepcion"))) return noEncontrado();
  return NextResponse.json({ ok: true });
});
