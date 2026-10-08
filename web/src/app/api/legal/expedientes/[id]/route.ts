import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { esPasante, validarExpedienteLegal } from "@/lib/legal";
import { serializar } from "@/lib/serialize";
import { conModulo } from "@/lib/con-modulo";

export const PATCH = conModulo(
  "legal",
  {},
  async (sesion, req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const id = aBigInt((await params).id);
  if (id === null) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  const actual = await db.expedienteLegal.findFirst({
    where: {
      id,
      ...(esPasante(sesion.puesto, sesion.rol)
        ? { responsableId: sesion.userId }
        : {}),
    },
  });
  if (!actual) return NextResponse.json({ error: "expediente no encontrado" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const validacion = validarExpedienteLegal({ ...actual, ...body });
  if ("error" in validacion) {
    return NextResponse.json({ error: validacion.error }, { status: 400 });
  }
  const expediente = await db.expedienteLegal.update({
    where: { id },
    data: {
      ...validacion.data,
      ...(esPasante(sesion.puesto, sesion.rol)
        ? { responsableId: sesion.userId }
        : {}),
    },
  });
  return NextResponse.json(serializar({ expediente }));
  },
);
