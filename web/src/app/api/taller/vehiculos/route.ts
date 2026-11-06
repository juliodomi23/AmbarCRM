import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { referenciaPropia } from "@/lib/referencias";

const texto = (valor: unknown) => String(valor ?? "").trim();

export const GET = conModulo("taller", {}, async (_sesion, req: NextRequest) => {
  const q = texto(req.nextUrl.searchParams.get("q")).slice(0, 100);
  const vehiculos = await db.tallerVehiculo.findMany({
    where: q ? { OR: [
      { placa: { contains: q, mode: "insensitive" } },
      { marca: { contains: q, mode: "insensitive" } },
      { modelo: { contains: q, mode: "insensitive" } },
      { contacto: { nombre: { contains: q, mode: "insensitive" } } },
    ] } : {},
    include: { contacto: { select: { id: true, nombre: true, telefono: true, email: true } } },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 200,
  });
  return NextResponse.json(serializar({ vehiculos }));
});

export const POST = conModulo("taller", {}, async (sesion, req: NextRequest) => {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Datos del vehículo inválidos" }, { status: 400 });
  const contactoId = await referenciaPropia("contacto", body.contactoId);
  if (!contactoId) return NextResponse.json({ error: "Selecciona un cliente existente" }, { status: 400 });
  const placa = texto(body.placa).toLocaleUpperCase("es-MX");
  const marca = texto(body.marca), modelo = texto(body.modelo);
  const anio = body.anio === "" || body.anio == null ? null : Number(body.anio);
  const kilometraje = body.kilometraje == null || body.kilometraje === "" ? 0 : Number(body.kilometraje);
  const vin = texto(body.vin).toLocaleUpperCase("es-MX") || null;
  if (!placa || placa.length > 20 || !marca || !modelo || marca.length > 80 || modelo.length > 80) return NextResponse.json({ error: "Placa, marca y modelo son obligatorios" }, { status: 400 });
  if (anio !== null && (!Number.isInteger(anio) || anio < 1886 || anio > new Date().getFullYear() + 1)) return NextResponse.json({ error: "Año inválido" }, { status: 400 });
  if (!Number.isSafeInteger(kilometraje) || kilometraje < 0) return NextResponse.json({ error: "Kilometraje inválido" }, { status: 400 });
  if (vin && (vin.length > 40 || !/^[A-Z0-9]+$/.test(vin))) return NextResponse.json({ error: "VIN inválido" }, { status: 400 });
  try {
    const vehiculo = await db.tallerVehiculo.create({ data: { contactoId, placa, vin, marca, modelo, anio, color: texto(body.color) || null, kilometraje, notas: texto(body.notas) || null }, include: { contacto: { select: { id: true, nombre: true, telefono: true, email: true } } } });
    return NextResponse.json(serializar({ vehiculo }), { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "La placa o el VIN ya están registrados en esta organización" }, { status: 409 });
    throw error;
  }
});
