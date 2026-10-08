import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { conModulo } from "@/lib/con-modulo";
import { paginacionListado } from "@/lib/paginacion";

export const GET = conModulo("citas", {}, async (sesion, req: NextRequest) => {
  const doctores = await db.doctor.findMany({
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
    ...paginacionListado(req),
  });
  return NextResponse.json(serializar({ doctores }));
});

export const POST = conModulo("citas", {}, async (sesion, req: NextRequest) => {
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
});
