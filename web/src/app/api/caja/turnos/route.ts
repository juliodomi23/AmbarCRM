import { NextRequest, NextResponse } from "next/server";
import { validarAperturaTurno } from "@/lib/caja";
import { puedeGestionarTurnos } from "@/lib/caja";
import { abrirTurnoCaja, ErrorCaja } from "@/lib/caja-db";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";

export const GET = conModulo("caja", {}, async (sesion) => {
  if (sesion.userId === null) return NextResponse.json({ error: "Usuario no disponible" }, { status: 400 });
  const [turno, recientes] = await Promise.all([
    db.turnoCaja.findFirst({
      where: { usuarioId: sesion.userId, estado: "abierto" },
      include: { caja: true, usuario: { select: { id: true, nombre: true } } },
    }),
    db.turnoCaja.findMany({
      where: puedeGestionarTurnos(sesion.rol, sesion.puesto) ? {} : { usuarioId: sesion.userId },
      include: { caja: true, usuario: { select: { id: true, nombre: true } } },
      orderBy: { abiertoAt: "desc" },
      take: 30,
    }),
  ]);
  return NextResponse.json(serializar({ turno, recientes }));
});

export const POST = conModulo("caja", {}, async (sesion, req: NextRequest) => {
  if (sesion.userId === null || sesion.orgId === null) {
    return NextResponse.json({ error: "Sesión incompleta" }, { status: 400 });
  }
  const validacion = validarAperturaTurno((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  try {
    const turno = await abrirTurnoCaja({ ...sesion, userId: sesion.userId, orgId: sesion.orgId }, validacion.data);
    return NextResponse.json(serializar({ turno }), { status: 201 });
  } catch (error) {
    if (error instanceof ErrorCaja) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
});
