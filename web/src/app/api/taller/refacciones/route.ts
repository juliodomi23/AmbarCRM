import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";

const text = (x: unknown) => String(x ?? "").trim();
export const GET = conModulo("taller", {}, async () => {
  const refacciones = await db.tallerRefaccion.findMany({ orderBy: [{ existencia: "asc" }, { nombre: "asc" }], take: 500 });
  return NextResponse.json(serializar({ refacciones, bajas: refacciones.filter((r) => r.existencia <= r.minimo) }));
});
export const POST = conModulo("taller", {}, async (_sesion, req: NextRequest) => {
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const nombre = text(b.nombre), codigo = text(b.codigo).toUpperCase(), existencia = Number(b.existencia ?? 0), minimo = Number(b.minimo ?? 0), costo = Number(b.costo), precio = Number(b.precio);
  if (!nombre || !codigo || nombre.length > 120 || codigo.length > 50 || !Number.isSafeInteger(existencia) || existencia < 0 || !Number.isSafeInteger(minimo) || minimo < 0 || !Number.isFinite(costo) || costo < 0 || !Number.isFinite(precio) || precio < 0) return NextResponse.json({ error: "Revisa nombre, código, existencias, costo y precio" }, { status: 400 });
  try { const refaccion = await db.tallerRefaccion.create({ data: { nombre, codigo, existencia, minimo, costo: new Prisma.Decimal(costo), precio: new Prisma.Decimal(precio) } }); return NextResponse.json(serializar({ refaccion }), { status: 201 }); }
  catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return NextResponse.json({ error: "Ese código ya está registrado" }, { status: 409 }); throw e; }
});
