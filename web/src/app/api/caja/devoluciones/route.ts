import { NextRequest, NextResponse } from "next/server";
import { validarDevolucion } from "@/lib/caja-a2";
import { respuestaErrorCajaA2 } from "@/lib/caja-a2-api";
import { registrarDevolucion } from "@/lib/caja-a2-db";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";

export const GET = conModulo("caja", {}, async () => {
  const [ventas, devoluciones] = await Promise.all([
    db.venta.findMany({
      where: { estado: { notIn: ["cancelada", "apartado"] } },
      include: {
        contacto: { select: { id: true, nombre: true } },
        partidas: { include: { producto: true, devoluciones: { select: { cantidad: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.devolucionVenta.findMany({
      include: { ventaOriginal: { select: { id: true, folio: true } }, ventaCambio: { select: { id: true, folio: true } }, partidas: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);
  return NextResponse.json(serializar({ ventas, devoluciones }));
});

export const POST = conModulo("caja", {}, async (sesion, req: NextRequest) => {
  if (sesion.userId === null || sesion.orgId === null) return NextResponse.json({ error: "Sesión incompleta" }, { status: 400 });
  const validacion = validarDevolucion((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  try {
    const devolucion = await registrarDevolucion({ ...sesion, userId: sesion.userId, orgId: sesion.orgId }, validacion.data);
    return NextResponse.json(serializar({ devolucion }), { status: 201 });
  } catch (error) {
    return respuestaErrorCajaA2(error);
  }
});
