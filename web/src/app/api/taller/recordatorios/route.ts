import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { referenciaPropia } from "@/lib/referencias";
import { serializar } from "@/lib/serialize";

const error = (mensaje: string, status = 400) => NextResponse.json({ error: mensaje }, { status });
export const GET = conModulo("taller", {}, async () => {
  const recordatorios = await db.tallerRecordatorio.findMany({ where: { estado: "pendiente" }, include: { vehiculo: { include: { contacto: { select: { nombre: true, telefono: true } } } } }, orderBy: [{ proximaFecha: "asc" }, { proximoKm: "asc" }], take: 500 });
  return NextResponse.json(serializar({ recordatorios }));
});
export const POST = conModulo("taller", {}, async (_sesion, req: NextRequest) => {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return error("Datos del recordatorio inválidos");
  const vehiculoId = await referenciaPropia("tallerVehiculo", body.vehiculoId);
  if (vehiculoId === null || vehiculoId === false) return error("Vehículo no encontrado", 404);
  const tipo = String(body.tipo ?? "").trim(), proximoKm = body.proximoKm === "" || body.proximoKm == null ? null : Number(body.proximoKm), fechaRaw = String(body.proximaFecha ?? "").trim(), proximaFecha = fechaRaw ? new Date(`${fechaRaw}T00:00:00.000Z`) : null;
  if (!tipo || tipo.length > 100 || (proximoKm !== null && (!Number.isSafeInteger(proximoKm) || proximoKm < 0)) || (proximoKm === null && !proximaFecha) || (proximaFecha && !Number.isFinite(+proximaFecha))) return error("Indica tipo de servicio y una fecha o kilometraje válido");
  const ordenId = body.ordenId ? await referenciaPropia("tallerOrden", body.ordenId) : null;
  if (ordenId === false) return error("Orden no encontrada", 404);
  if (ordenId) { const orden = await db.tallerOrden.findFirst({ where: { id: ordenId, vehiculoId }, select: { id: true } }); if (!orden) return error("La orden no corresponde al vehículo", 400); }
  const recordatorio = await db.tallerRecordatorio.create({ data: { vehiculoId, ordenId: ordenId || null, tipo, proximoKm, proximaFecha } });
  return NextResponse.json(serializar({ recordatorio }), { status: 201 });
});
