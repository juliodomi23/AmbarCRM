import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { transaccionTenant } from "@/lib/retail-db";

const estados = ["recibido", "diagnostico", "esperando_aprobacion", "en_reparacion", "listo", "entregado", "cancelado"];
const texto = (value: unknown) => String(value ?? "").trim();
function parseConceptos(value: unknown) {
  if (!Array.isArray(value) || value.length > 100) return null;
  const parsed = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const c = raw as Record<string, unknown>;
    const tipo = texto(c.tipo), descripcion = texto(c.descripcion), cantidad = Number(c.cantidad), precioUnitario = Number(c.precioUnitario);
    if (!(tipo === "mano_obra" || tipo === "refaccion") || !descripcion || descripcion.length > 300 || !Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 100000 || !Number.isFinite(precioUnitario) || precioUnitario < 0 || precioUnitario > 100000000) return null;
    parsed.push({ tipo, descripcion, cantidad, precioUnitario });
  }
  return parsed;
}
function totalConceptos(conceptos: NonNullable<ReturnType<typeof parseConceptos>>) {
  return conceptos.reduce((sum, c) => sum + Math.round(c.cantidad * c.precioUnitario * 100) / 100, 0);
}

export const GET = conModulo("taller", {}, async (_sesion, req: NextRequest) => {
  const estado = req.nextUrl.searchParams.get("estado");
  if (estado && !estados.includes(estado)) return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
  const ordenes = await db.tallerOrden.findMany({ where: estado ? { estado } : {}, include: { vehiculo: { include: { contacto: { select: { id: true, nombre: true, telefono: true } } } }, conceptos: true, cambios: { orderBy: { creadoAt: "asc" } } }, orderBy: { updatedAt: "desc" }, take: 300 });
  return NextResponse.json(serializar({ ordenes }));
});

export const POST = conModulo("taller", {}, async (sesion, req: NextRequest) => {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Datos de la orden inválidos" }, { status: 400 });
  const vehiculoId = BigInt(String(body.vehiculoId ?? 0));
  const kmEntrada = Number(body.kmEntrada), fallaReportada = texto(body.fallaReportada);
  const conceptos = parseConceptos(body.conceptos ?? []);
  const fechaPromesa = body.fechaPromesa ? new Date(String(body.fechaPromesa)) : null;
  if (vehiculoId <= 0n || !Number.isSafeInteger(kmEntrada) || kmEntrada < 0 || !fallaReportada || fallaReportada.length > 2000 || !conceptos || (fechaPromesa && !Number.isFinite(+fechaPromesa))) return NextResponse.json({ error: "Revisa el vehículo, kilometraje, falla y conceptos" }, { status: 400 });
  const creado = await transaccionTenant(sesion.orgId!, async (tx) => {
    const [vehiculo] = await tx.$queryRaw<{ id: bigint; kilometraje: number }[]>`SELECT id, kilometraje FROM taller_vehiculos WHERE id = ${vehiculoId} FOR UPDATE`;
    if (!vehiculo) return null;
    const orden = await tx.tallerOrden.create({ data: { vehiculoId, kmEntrada, fallaReportada, diagnostico: "", fechaPromesa, creadoPorId: sesion.userId, total: new Prisma.Decimal(totalConceptos(conceptos)) } });
    if (conceptos.length) await tx.tallerOrdenConcepto.createMany({ data: conceptos.map((c) => ({ ordenId: orden.id, tipo: c.tipo, descripcion: c.descripcion, cantidad: new Prisma.Decimal(c.cantidad), precioUnitario: new Prisma.Decimal(c.precioUnitario) })) });
    await tx.tallerOrdenCambio.create({ data: { ordenId: orden.id, estado: "recibido", userId: sesion.userId } });
    if (kmEntrada > vehiculo.kilometraje) await tx.tallerVehiculo.update({ where: { id: vehiculoId }, data: { kilometraje: kmEntrada, version: { increment: 1 } } });
    return tx.tallerOrden.findUnique({ where: { id: orden.id }, include: { vehiculo: { include: { contacto: true } }, conceptos: true, cambios: true } });
  });
  return creado ? NextResponse.json(serializar({ orden: creado }), { status: 201 }) : NextResponse.json({ error: "Vehículo no encontrado" }, { status: 404 });
});
