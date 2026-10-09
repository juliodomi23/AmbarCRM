import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conModulo } from "@/lib/con-modulo";
import { serializar } from "@/lib/serialize";
import { fusionar, idDeRuta, noEncontrado, respuestaNegocio, type PropsId } from "@/lib/rutas-edicion";
import { esPasante } from "@/lib/legal";
import { referenciaAjena } from "@/lib/referencias";
import { validarAsesoriaLegal } from "@/lib/legal";

/** El pasante solo toca las asesorías que tiene a su nombre. */
function filtro(sesion: { puesto: string; rol?: string; userId: bigint | null }, id: bigint) {
  return { id, ...(esPasante(sesion.puesto, sesion.rol) ? { abogadoId: sesion.userId } : {}) };
}

export const PATCH = conModulo("asesorias_legales", {}, async (sesion, req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  const actual = id ? await db.asesoriaLegal.findFirst({ where: filtro(sesion, id) }) : null;
  if (!id || !actual) return noEncontrado();
  const validacion = validarAsesoriaLegal(fusionar(actual, await req.json().catch(() => ({}))));
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  const ajena = await referenciaAjena(validacion.data, {
    expedienteId: "expedienteLegal", contactoId: "contacto", sucursalId: "sucursalLegal", abogadoId: "usuario",
  });
  if (ajena) return NextResponse.json({ error: `${ajena} inexistente` }, { status: 400 });
  const datos = esPasante(sesion.puesto, sesion.rol) ? { ...validacion.data, abogadoId: sesion.userId } : validacion.data;
  return NextResponse.json(serializar({ asesoria: await db.asesoriaLegal.update({ where: { id }, data: datos }) }));
});

export const DELETE = conModulo("asesorias_legales", {}, async (sesion, _req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  if (!id || !(await db.asesoriaLegal.findFirst({ where: filtro(sesion, id), select: { id: true } }))) return noEncontrado();
  await db.asesoriaLegal.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
