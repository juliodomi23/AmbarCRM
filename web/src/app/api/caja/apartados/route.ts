import { NextRequest, NextResponse } from "next/server";
import { validarApartado } from "@/lib/caja-a2";
import { respuestaErrorCajaA2 } from "@/lib/caja-a2-api";
import { crearApartado } from "@/lib/caja-a2-db";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";

export const GET = conModulo("caja", {}, async () => {
  const apartados = await db.apartado.findMany({
    include: { contacto: true, venta: { include: { partidas: { include: { producto: true } } } }, abonos: { orderBy: { createdAt: "desc" } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(serializar({ apartados }));
});

export const POST = conModulo("caja", {}, async (sesion, req: NextRequest) => {
  if (sesion.userId === null || sesion.orgId === null) return NextResponse.json({ error: "Sesión incompleta" }, { status: 400 });
  const validacion = validarApartado((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  try {
    const resultado = await crearApartado({ ...sesion, userId: sesion.userId, orgId: sesion.orgId }, validacion.data);
    return NextResponse.json(serializar(resultado), { status: resultado.repetido ? 200 : 201 });
  } catch (error) {
    return respuestaErrorCajaA2(error);
  }
});
