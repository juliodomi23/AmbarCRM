import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validarAsesoriaLegal } from "@/lib/legal";
import { requireModuloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { requireSesion } from "@/lib/session";

export async function POST(req: NextRequest) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const apagado = await requireModuloActivo("asesorias_legales");
  if (apagado) return apagado;
  const validacion = validarAsesoriaLegal(await req.json().catch(() => ({})));
  if ("error" in validacion) {
    return NextResponse.json({ error: validacion.error }, { status: 400 });
  }
  const asesoria = await db.asesoriaLegal.create({ data: validacion.data });
  return NextResponse.json(serializar({ asesoria }), { status: 201 });
}
