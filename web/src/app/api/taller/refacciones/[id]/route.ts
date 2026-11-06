import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { serializar } from "@/lib/serialize";

export const PATCH = conModulo("taller", {}, async (_sesion, req: NextRequest, props: { params: Promise<{ id: string }> }) => {
  const id = aBigInt((await props.params).id), b = await req.json().catch(() => null);
  if (!id || !b || typeof b !== "object") return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const version = Number(b.version), existencia = Number(b.existencia), minimo = Number(b.minimo), costo = Number(b.costo), precio = Number(b.precio), nombre = String(b.nombre ?? "").trim(), codigo = String(b.codigo ?? "").trim().toUpperCase();
  if (!Number.isSafeInteger(version) || version < 1 || !Number.isSafeInteger(existencia) || existencia < 0 || !Number.isSafeInteger(minimo) || minimo < 0 || !Number.isFinite(costo) || costo < 0 || !Number.isFinite(precio) || precio < 0 || !nombre || !codigo) return NextResponse.json({ error: "Revisa los datos de la refacción" }, { status: 400 });
  const result = await db.tallerRefaccion.updateMany({ where: { id, version }, data: { nombre, codigo, existencia, minimo, costo: new Prisma.Decimal(costo), precio: new Prisma.Decimal(precio), version: { increment: 1 } } });
  if (!result.count) return NextResponse.json({ error: "La refacción cambió desde que la abriste o no existe" }, { status: 409 });
  const refaccion = await db.tallerRefaccion.findUnique({ where: { id } });
  return NextResponse.json(serializar({ refaccion }));
});
