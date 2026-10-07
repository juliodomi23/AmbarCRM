import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireModuloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { requireSesion } from "@/lib/session";

export async function GET() {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const apagado = await requireModuloActivo("citas");
  if (apagado) return apagado;
  const doctores = await db.doctor.findMany({
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
  });
  return NextResponse.json(serializar({ doctores }));
}

export async function POST(req: NextRequest) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const apagado = await requireModuloActivo("citas");
  if (apagado) return apagado;
  const body = await req.json().catch(() => ({}));
  const nombre = String(body.nombre ?? "").trim();
  if (!nombre) {
    return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  }
  const existente = await db.doctor.findFirst({ where: { nombre } });
  if (existente) {
    return NextResponse.json({ error: "Ya existe un doctor con ese nombre" }, { status: 409 });
  }
  const doctor = await db.doctor.create({
    data: {
      nombre,
      especialidad: String(body.especialidad ?? "").trim() || null,
      cedula: String(body.cedula ?? "").trim() || null,
      color: /^#[0-9a-f]{6}$/i.test(body.color) ? body.color : "#0EA5E9",
    },
  });
  return NextResponse.json(serializar({ doctor }), { status: 201 });
}
