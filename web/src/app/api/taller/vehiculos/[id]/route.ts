import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { serializar } from "@/lib/serialize";

type Props = { params: Promise<{ id: string }> };
const error = (mensaje: string, estado = 400) => NextResponse.json({ error: mensaje }, { status: estado });

export const GET = conModulo("taller", {}, async (_sesion, _req: NextRequest, props: Props) => {
  const id = aBigInt((await props.params).id);
  if (!id) return error("Vehículo inválido");
  const vehiculo = await db.tallerVehiculo.findUnique({ where: { id }, include: { contacto: { select: { id: true, nombre: true, telefono: true, email: true } }, ordenes: { orderBy: { createdAt: "desc" }, take: 50 } } });
  return vehiculo ? NextResponse.json(serializar({ vehiculo })) : error("Vehículo no encontrado", 404);
});

export const PATCH = conModulo("taller", {}, async (_sesion, req: NextRequest, props: Props) => {
  const id = aBigInt((await props.params).id);
  const body = await req.json().catch(() => null);
  if (!id || !body || typeof body !== "object" || Array.isArray(body)) return error("Datos del vehículo inválidos");
  const version = Number(body.version);
  if (!Number.isSafeInteger(version) || version < 1) return error("Versión inválida");
  const current = await db.tallerVehiculo.findUnique({ where: { id }, select: { version: true } });
  if (!current) return error("Vehículo no encontrado", 404);
  if (current.version !== version) return error("El vehículo cambió desde que lo abriste. Recarga y vuelve a intentar.", 409);
  const placa = String(body.placa ?? "").trim().toLocaleUpperCase("es-MX"), marca = String(body.marca ?? "").trim(), modelo = String(body.modelo ?? "").trim();
  const kilometraje = Number(body.kilometraje);
  if (!placa || !marca || !modelo || !Number.isSafeInteger(kilometraje) || kilometraje < 0) return error("Placa, marca, modelo y kilometraje válido son obligatorios");
  const anio = body.anio === "" || body.anio == null ? null : Number(body.anio);
  if (anio !== null && (!Number.isInteger(anio) || anio < 1886 || anio > new Date().getFullYear() + 1)) return error("Año inválido");
  try {
    const result = await db.tallerVehiculo.updateMany({ where: { id, version }, data: { placa, marca, modelo, anio, vin: String(body.vin ?? "").trim().toUpperCase() || null, color: String(body.color ?? "").trim() || null, kilometraje, notas: String(body.notas ?? "").trim() || null, version: { increment: 1 } } });
    if (!result.count) return error("El vehículo cambió desde que lo abriste. Recarga y vuelve a intentar.", 409);
    const vehiculo = await db.tallerVehiculo.findUnique({ where: { id }, include: { contacto: true, ordenes: { orderBy: { createdAt: "desc" }, take: 50 } } });
    return NextResponse.json(serializar({ vehiculo }));
  } catch (e) {
    if (typeof e === "object" && e !== null && "code" in e && e.code === "P2002") return error("La placa o el VIN ya están registrados en esta organización", 409);
    throw e;
  }
});
