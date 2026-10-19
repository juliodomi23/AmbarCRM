import { NextRequest, NextResponse } from "next/server";
import { db, runWithOrg } from "@/lib/db";
import { errorPublico, limitarIp } from "@/lib/reservas/publico";
import { fechaEnAgenda, reprogramarCita } from "@/lib/reservas/servidor";
import { fechaLocal, sumarDias } from "@/lib/reservas/horarios";
import { citaDelToken, detalleGestion, horariosGestion } from "@/lib/reservas/gestion";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ token: string }> };

/** El enlace solo devuelve datos de la cita, sin información personal del cliente. */
export async function GET(req: NextRequest, { params }: Props) {
  const limite = limitarIp(req, "cita", 60, 60_000);
  if (limite) return limite;
  const encontrada = await citaDelToken((await params).token);
  if (!encontrada) return errorPublico("Cita no encontrada", 404);
  const q = req.nextUrl.searchParams;
  if (!q.has("fecha") && !q.has("desde")) return NextResponse.json(detalleGestion(encontrada));
  if (!encontrada.reprogramable) return errorPublico("Esta cita ya no se puede reprogramar en línea; escríbele al negocio", 409);
  const { config } = encontrada;
  const fecha = q.get("fecha");
  if (q.has("fecha")) {
    if (!fechaEnAgenda(config, fecha)) return errorPublico("Fecha fuera de la agenda", 400);
    return NextResponse.json({ horarios: await horariosGestion(encontrada, fecha!) });
  }
  const desde = q.get("desde");
  if (!fechaEnAgenda(config, desde)) return errorPublico("Fecha fuera de la agenda", 400);
  const hoy = fechaLocal(new Date(), config.zona);
  const ultimo = sumarDias(hoy, config.ventanaDias - 1);
  const dias: string[] = [];
  for (let i = 0; i < 14; i++) {
    const dia = sumarDias(desde!, i);
    if (dia > ultimo) break;
    if ((await horariosGestion(encontrada, dia)).length) dias.push(dia);
  }
  const siguiente = sumarDias(desde!, 14);
  return NextResponse.json({ dias, siguiente: siguiente <= ultimo ? siguiente : null });
}

export async function POST(req: NextRequest, { params }: Props) {
  const limite = limitarIp(req, "cita", 60, 60_000);
  if (limite) return limite;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return errorPublico("Datos de reserva inválidos", 400);
  if (!["cancelar", "reprogramar", "confirmar"].includes(body.accion)) return errorPublico("Acción inválida", 400);
  const { token } = await params;
  const encontrada = await citaDelToken(token);
  if (!encontrada) return errorPublico("Cita no encontrada", 404);
  const { orgId, cita, config } = encontrada;
  if (!["programada", "confirmada"].includes(cita.estado)) return errorPublico("Esta cita ya no se puede modificar en línea", 409);
  if (cita.inicio <= new Date()) return errorPublico("La cita ya empezó; escríbele al negocio", 409);
  if (body.accion === "confirmar") {
    if (body.inicioOriginal !== cita.inicio.toISOString()) return errorPublico("La cita cambió; vuelve a consultar el enlace", 409);
    const confirmada = await runWithOrg(orgId, () => db.cita.updateMany({
      where: { id: cita.id, inicio: cita.inicio, estado: { in: ["programada", "confirmada"] }, AND: { inicio: { gt: new Date() } } },
      data: { estado: "confirmada" },
    }));
    if (!confirmada.count) return errorPublico("La cita cambió; vuelve a consultar el enlace", 409);
    return NextResponse.json({ ok: true, estado: "confirmada" });
  }
  if (body.accion === "cancelar") {
    const cancelada = await runWithOrg(orgId, () => db.cita.updateMany({
      where: { id: cita.id, estado: { in: ["programada", "confirmada"] }, inicio: cita.inicio, AND: { inicio: { gt: new Date() } } },
      data: { estado: "cancelada" },
    }));
    if (!cancelada.count) return errorPublico("La cita cambió; vuelve a consultar el enlace", 409);
    return NextResponse.json({ ok: true, estado: "cancelada" });
  }
  if (!encontrada.reprogramable || !cita.doctorId) return errorPublico("Esta cita ya no se puede reprogramar en línea; escríbele al negocio", 409);
  if (typeof body.inicio !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(body.inicio)) return errorPublico("Horario inválido", 400);
  const inicio = new Date(body.inicio);
  if (!Number.isFinite(+inicio) || !fechaEnAgenda(config, fechaLocal(inicio, config.zona))) return errorPublico("Fecha fuera de la agenda", 400);
  if (body.inicioOriginal !== cita.inicio.toISOString()) return errorPublico("La cita cambió; vuelve a consultar el enlace", 409);
  if (+inicio === +cita.inicio) return errorPublico("Elige un horario diferente al actual", 400);
  const movida = await reprogramarCita(orgId, { ...cita, doctorId: cita.doctorId }, inicio, true, { token });
  if (!movida) return errorPublico("El horario ya no está disponible o la cita cambió. Vuelve a consultar los horarios.", 409);
  const actualizada = await citaDelToken(token);
  if (!actualizada) return errorPublico("Cita no encontrada", 404);
  return NextResponse.json({ ok: true, cita: detalleGestion(actualizada) });
}
