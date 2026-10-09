import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";

export const GET = conModulo("caja", {}, async () => {
  const cajas = await db.caja.findMany({ orderBy: [{ activa: "desc" }, { nombre: "asc" }] });
  return NextResponse.json(serializar({ cajas }));
});

export const POST = conModulo("caja", { admin: true }, async (_sesion, req: NextRequest) => {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const nombre = String(body.nombre ?? "").trim();
  const sucursal = String(body.sucursal ?? "").trim() || null;
  if (!nombre) return NextResponse.json({ error: "El nombre de la caja es obligatorio" }, { status: 400 });
  const caja = await db.caja.create({ data: { nombre, sucursal } });
  return NextResponse.json(serializar({ caja }), { status: 201 });
});
