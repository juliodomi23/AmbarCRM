import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validarExpedienteLegal } from "@/lib/legal";
import { requireModuloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { requireSesion } from "@/lib/session";

export async function GET() {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const apagado = await requireModuloActivo("legal");
  if (apagado) return apagado;
  const expedientes = await db.expedienteLegal.findMany({
    include: { contacto: true, responsable: true, sucursal: true },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(serializar({ expedientes }));
}

export async function POST(req: NextRequest) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const apagado = await requireModuloActivo("legal");
  if (apagado) return apagado;
  const validacion = validarExpedienteLegal(await req.json().catch(() => ({})));
  if ("error" in validacion) {
    return NextResponse.json({ error: validacion.error }, { status: 400 });
  }
  const expediente = await db.expedienteLegal.create({ data: validacion.data });
  return NextResponse.json(serializar({ expediente }), { status: 201 });
}
