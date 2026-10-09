import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { esPasante, validarExpedienteLegal } from "@/lib/legal";
import { serializar } from "@/lib/serialize";
import { conModulo } from "@/lib/con-modulo";
import { paginacionListado } from "@/lib/paginacion";
import { referenciaAjena } from "@/lib/referencias";

export const GET = conModulo("legal", {}, async (sesion, req: NextRequest) => {
  const expedientes = await db.expedienteLegal.findMany({
    where: esPasante(sesion.puesto, sesion.rol)
      ? { responsableId: sesion.userId }
      : undefined,
    include: { contacto: true, responsable: true, sucursal: true },
    orderBy: { updatedAt: "desc" },
    ...paginacionListado(req),
  });
  return NextResponse.json(serializar({ expedientes }));
});

export const POST = conModulo("legal", {}, async (sesion, req: NextRequest) => {
  const validacion = validarExpedienteLegal(await req.json().catch(() => ({})));
  if ("error" in validacion) {
    return NextResponse.json({ error: validacion.error }, { status: 400 });
  }
  const ajena = await referenciaAjena(validacion.data, { contactoId: "contacto", responsableId: "usuario", sucursalId: "sucursalLegal" });
  if (ajena) return NextResponse.json({ error: `${ajena} inexistente` }, { status: 400 });
  const expediente = await db.expedienteLegal.create({
    data: {
      ...validacion.data,
      responsableId: validacion.data.responsableId ?? sesion.userId,
      ...(esPasante(sesion.puesto, sesion.rol)
        ? { responsableId: sesion.userId }
        : {}),
    },
  });
  return NextResponse.json(serializar({ expediente }), { status: 201 });
});
