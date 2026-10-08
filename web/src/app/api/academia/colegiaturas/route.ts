import { NextRequest, NextResponse } from "next/server";
import { validarColegiatura } from "@/lib/academia";
import { db } from "@/lib/db";
import { requireModuloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { requireSesion } from "@/lib/session";

export async function POST(req: NextRequest) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const apagado = await requireModuloActivo("colegiaturas");
  if (apagado) return apagado;
  const validacion = validarColegiatura(await req.json().catch(() => ({})));
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  const colegiatura = await db.colegiaturaAcademia.create({ data: validacion.data });
  return NextResponse.json(serializar({ colegiatura }), { status: 201 });
}
