import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conModulo } from "@/lib/con-modulo";
import { serializar } from "@/lib/serialize";
import { fusionar, idDeRuta, noEncontrado, respuestaNegocio, type PropsId } from "@/lib/rutas-edicion";
import { dinero } from "@/lib/dinero";
import { actualizarReserva, borrarReserva } from "@/lib/ediciones-db";

const ESTADOS = ["solicitada", "confirmada", "liquidada", "cancelada", "reembolsada"];

export const PATCH = conModulo("reservas_tours", {}, async (sesion, req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  if (!id || sesion.orgId === null) return noEncontrado();
  const body = await req.json().catch(() => ({}));
  const cambios: Parameters<typeof actualizarReserva>[2] = {};
  if ("estado" in body) {
    if (!ESTADOS.includes(body.estado)) return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
    cambios.estado = body.estado;
  }
  if ("viajeros" in body) {
    const viajeros = Number(body.viajeros);
    if (!Number.isInteger(viajeros) || viajeros < 1) return NextResponse.json({ error: "Viajeros inválidos" }, { status: 400 });
    cambios.viajeros = viajeros;
  }
  if ("total" in body) {
    const total = dinero(body.total);
    if (total === null) return NextResponse.json({ error: "Total inválido (máximo 2 decimales)" }, { status: 400 });
    cambios.total = total;
  }
  if ("notas" in body) cambios.notas = String(body.notas ?? "").trim().slice(0, 3000) || null;
  if ("fechaSalida" in body) {
    const fecha = body.fechaSalida ? new Date(body.fechaSalida) : null;
    if (fecha && Number.isNaN(+fecha)) return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
    cambios.fechaSalida = fecha;
  }
  try {
    return NextResponse.json(serializar({ reserva: await actualizarReserva(sesion.orgId, id, cambios) }));
  } catch (error) {
    return respuestaNegocio(error);
  }
});

export const DELETE = conModulo("reservas_tours", {}, async (sesion, _req: NextRequest, props: PropsId) => {
  const id = await idDeRuta(props);
  if (!id || sesion.orgId === null) return noEncontrado();
  try {
    await borrarReserva(sesion.orgId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return respuestaNegocio(error);
  }
});
