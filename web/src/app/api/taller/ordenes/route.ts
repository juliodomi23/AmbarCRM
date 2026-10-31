import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { transaccionTenant } from "@/lib/retail-db";
import { ajustarExistenciasTaller, ErrorStockTaller } from "@/lib/taller-inventario";
import { calcularTotalTaller } from "@/lib/taller-reglas";
import { aBigInt } from "@/lib/ids";

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
    const refaccionId = c.refaccionId ? aBigInt(String(c.refaccionId)) : null;
    if (c.refaccionId && !refaccionId) return null;
    if ((tipo === "refaccion" && !refaccionId) || (tipo === "mano_obra" && refaccionId)) return null;
    parsed.push({ tipo, descripcion, cantidad, precioUnitario, refaccionId });
  }
  return parsed;
}
function totalConceptos(conceptos: NonNullable<ReturnType<typeof parseConceptos>>) {
  return calcularTotalTaller(conceptos);
}

export const GET = conModulo("taller", {}, async (_sesion, req: NextRequest) => {
  const estado = req.nextUrl.searchParams.get("estado");
  if (estado && !estados.includes(estado)) return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
  const ordenes = await db.tallerOrden.findMany({ where: estado ? { estado } : {}, include: { vehiculo: { include: { contacto: { select: { id: true, nombre: true, telefono: true } } } }, conceptos: true, cambios: { orderBy: { creadoAt: "asc" } } }, orderBy: { updatedAt: "desc" }, take: 300 });
  return NextResponse.json(serializar({ ordenes }));
});

export const POST = conModulo("taller", {}, async (sesion, req: NextRequest) => {
  if (sesion.userId === null) return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });
  const userId = sesion.userId;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Datos de la orden inválidos" }, { status: 400 });
  const vehiculoId = aBigInt(String(body.vehiculoId ?? ""));
  const kmEntrada = Number(body.kmEntrada), fallaReportada = texto(body.fallaReportada);
  const conceptos = parseConceptos(body.conceptos ?? []);
  const fechaPromesa = body.fechaPromesa ? new Date(String(body.fechaPromesa)) : null;
  if (!vehiculoId || vehiculoId <= 0n || !Number.isSafeInteger(kmEntrada) || kmEntrada < 0 || !fallaReportada || fallaReportada.length > 2000 || !conceptos || (fechaPromesa && !Number.isFinite(+fechaPromesa))) return NextResponse.json({ error: "Revisa el vehículo, kilometraje, falla y conceptos" }, { status: 400 });
  try {
  const creado = await transaccionTenant(sesion.orgId!, async (tx) => {
    const [vehiculo] = await tx.$queryRaw<{ id: bigint; kilometraje: number }[]>`SELECT id, kilometraje FROM taller_vehiculos WHERE id = ${vehiculoId} FOR UPDATE`;
    if (!vehiculo) return null;
    const refIds = [...new Set(conceptos.flatMap((c) => c.refaccionId ? [c.refaccionId] : []))];
    const refs = refIds.length ? await tx.tallerRefaccion.findMany({ where: { id: { in: refIds } } }) : [];
    if (refs.length !== refIds.length) throw new ErrorStockTaller("Una refacción no existe en esta organización");
    const precioRef = new Map(refs.map((r) => [String(r.id), Number(r.precio)]));
    const normalizados = conceptos.map((c) => ({ ...c, precioUnitario: c.refaccionId ? precioRef.get(String(c.refaccionId))! : c.precioUnitario }));
    const deltas = new Map<string, Prisma.Decimal>();
    for (const c of normalizados) if (c.refaccionId) deltas.set(String(c.refaccionId), (deltas.get(String(c.refaccionId)) ?? new Prisma.Decimal(0)).plus(c.cantidad));
    await ajustarExistenciasTaller(tx, deltas);
    const orden = await tx.tallerOrden.create({ data: { vehiculoId, kmEntrada, fallaReportada, diagnostico: "", fechaPromesa, creadoPorId: userId, total: new Prisma.Decimal(totalConceptos(normalizados)) } });
    if (normalizados.length) await tx.tallerOrdenConcepto.createMany({ data: normalizados.map((c) => ({ ordenId: orden.id, tipo: c.tipo, descripcion: c.descripcion, cantidad: new Prisma.Decimal(c.cantidad), precioUnitario: new Prisma.Decimal(c.precioUnitario), ...(c.refaccionId ? { refaccionId: c.refaccionId } : {}) })) });
    await tx.tallerOrdenCambio.create({ data: { ordenId: orden.id, estado: "recibido", userId } });
    if (kmEntrada > vehiculo.kilometraje) await tx.tallerVehiculo.update({ where: { id: vehiculoId }, data: { kilometraje: kmEntrada, version: { increment: 1 } } });
    return tx.tallerOrden.findUnique({ where: { id: orden.id }, include: { vehiculo: { include: { contacto: true } }, conceptos: true, cambios: true } });
  });
  return creado ? NextResponse.json(serializar({ orden: creado }), { status: 201 }) : NextResponse.json({ error: "Vehículo no encontrado" }, { status: 404 });
  } catch (error) {
    if (error instanceof ErrorStockTaller) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
});
