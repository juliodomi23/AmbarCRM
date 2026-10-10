import { NextRequest, NextResponse } from "next/server";
import { conBot, conversacionDelBot } from "@/lib/bot-auth";
import { auditarBot } from "@/lib/services/bots";
import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { serializar } from "@/lib/serialize";
import { conErrores } from "@/lib/errores-api";
import {
  candidatosParaHorario,
  configReservasEmpresa,
  doctoresDelServicio,
  ESTADOS_OCUPAN,
  fechaEnAgenda,
  horariosDeDoctor,
  inicioDeFechaHora,
  reprogramarCita,
  reservarCita,
} from "@/lib/reservas/servidor";
import { enlacePublicoGestion } from "@/lib/citas";
import { fechaLocal } from "@/lib/reservas/horarios";

const ESTADOS_BOT = ["confirmada", "cancelada"] as const;
type Props = { params: Promise<{ accountId: string; conversationId: string }> };

async function manejarGET(req: NextRequest, props: Props) {
  const { conversationId } = await props.params;
  return conBot(req, "agendar_cita", async (botAutenticado) => {
    const acceso = await conversacionDelBot(botAutenticado, conversationId, "citas");
    if (!acceso.conv) return acceso.respuesta;
    const citas = await db.cita.findMany({
      where: {
        contactoId: acceso.conv.contactoId,
        inicio: { gte: new Date() },
        estado: { notIn: ["cancelada", "no_asistio"] },
      },
      include: { doctor: true },
      orderBy: { inicio: "asc" },
      take: 10,
    });
    return NextResponse.json(serializar({ citas }));
  });
}

/**
 * Agenda una cita para el contacto de la conversación, con el mismo bloqueo del profesional
 * que Reservas en línea.
 * POST …/appointments  Body: { fecha: "YYYY-MM-DD", hora: "HH:MM", servicioId, profesionalId?, notas? }
 */
async function manejarPOST(req: NextRequest, props: Props) {
  const { conversationId } = await props.params;
  return conBot(req, "agendar_cita", async (botAutenticado) => {
    const acceso = await conversacionDelBot(botAutenticado, conversationId, "citas");
    if (!acceso.conv) return acceso.respuesta;
    const { conv: conversacion, bot } = acceso;

    const b = await req.json().catch(() => ({}));
    const cfg = await configReservasEmpresa();
    const servicioId = aBigInt(String(b.servicioId ?? ""));
    if (servicioId === null) return NextResponse.json({ error: "servicioId requerido" }, { status: 400 });
    const profesionalId = b.profesionalId == null || b.profesionalId === "" ? null : aBigInt(String(b.profesionalId));
    if (b.profesionalId != null && b.profesionalId !== "" && profesionalId === null) {
      return NextResponse.json({ error: "profesionalId inválido" }, { status: 400 });
    }
    if (!fechaEnAgenda(cfg, b.fecha)) {
      return NextResponse.json({ error: "fecha inválida o fuera de la agenda" }, { status: 400 });
    }
    const inicio = inicioDeFechaHora(cfg, b.fecha, b.hora);
    if (!inicio) return NextResponse.json({ error: "hora inválida (HH:MM)" }, { status: 400 });
    const notas = String(b.notas ?? "").trim().slice(0, 500) || null;

    const servicio = await db.servicioReserva.findFirst({ where: { id: servicioId, activo: true } });
    if (!servicio) return NextResponse.json({ error: "servicio no disponible" }, { status: 404 });

    // Reintento de n8n: si el contacto ya tiene una cita igual, se devuelve en vez de duplicarla.
    const existente = await db.cita.findFirst({
      where: {
        contactoId: conversacion.contactoId,
        servicioId: servicio.id,
        inicio,
        estado: { in: ESTADOS_OCUPAN },
        ...(profesionalId !== null ? { doctorId: profesionalId } : {}),
      },
      include: { doctor: { select: { nombre: true } } },
    });
    if (existente) return NextResponse.json(respuestaCita(existente, true), { status: 200 });

    const elegibles = (await doctoresDelServicio(servicio.id)).map((d) => d.id);
    const candidatos = await candidatosParaHorario(cfg, servicio, elegibles, profesionalId, b.fecha, inicio);
    if (candidatos === null) {
      return NextResponse.json({ error: "profesional no disponible para este servicio" }, { status: 400 });
    }
    if (candidatos.length === 0) {
      return NextResponse.json({ error: "ese horario no está disponible" }, { status: 409 });
    }
    const cita = await reservarCita(bot.orgId, {
      servicio,
      candidatos: candidatos.map(BigInt),
      inicio,
      contactoId: conversacion.contactoId,
      notas,
      origen: "bot",
      conversacionId: conversacion.id,
    });
    if (!cita) return NextResponse.json({ error: "ese horario acaba de ocuparse" }, { status: 409 });

    await auditarBot(bot, conversacion.id, "cita_agendada", {
      entidad: "cita",
      entidadId: cita.id,
      despues: { inicio: cita.inicio, fin: cita.fin, servicioId: servicio.id, doctorId: cita.doctorId },
    });
    return NextResponse.json(respuestaCita(cita, false), { status: 201 });
  });
}

function respuestaCita(
  cita: { id: bigint; titulo: string; inicio: Date; fin: Date; estado: string; doctorId: bigint | null; servicioId: bigint | null; tokenGestion: string | null; doctor?: { nombre: string } | null },
  repetida: boolean,
) {
  return serializar({
    cita: {
      id: cita.id,
      titulo: cita.titulo,
      inicio: cita.inicio,
      fin: cita.fin,
      estado: cita.estado,
      doctorId: cita.doctorId,
      servicioId: cita.servicioId,
      especialista: cita.doctor?.nombre ?? null,
      enlaceGestion: cita.tokenGestion ? enlacePublicoGestion(cita.tokenGestion) : null,
    },
    ...(repetida ? { repetida: true } : {}),
  });
}

/** PATCH {citaId, fecha, hora}: reprograma con las mismas validaciones que agendar. */
async function reprogramar(
  acceso: { conv: { id: bigint; contactoId: bigint }; bot: { id: bigint; orgId: bigint } },
  body: Record<string, unknown>,
) {
  const { conv: conversacion, bot } = acceso;
  const citaId = aBigInt(String(body.citaId ?? ""));
  if (citaId === null) return NextResponse.json({ error: "citaId requerido" }, { status: 400 });
  const cfg = await configReservasEmpresa();
  if (!fechaEnAgenda(cfg, body.fecha)) {
    return NextResponse.json({ error: "fecha inválida o fuera de la agenda" }, { status: 400 });
  }
  const nuevoInicio = inicioDeFechaHora(cfg, body.fecha, body.hora);
  if (!nuevoInicio) return NextResponse.json({ error: "hora inválida (HH:MM)" }, { status: 400 });

  const cita = await db.cita.findFirst({ where: { id: citaId, contactoId: conversacion.contactoId } });
  if (!cita) return NextResponse.json({ error: "cita inexistente" }, { status: 404 });
  if (!["programada", "confirmada"].includes(cita.estado)) {
    return NextResponse.json({ error: `una cita ${cita.estado} no se puede reprogramar` }, { status: 409 });
  }
  if (cita.doctorId === null) {
    return NextResponse.json(
      { error: "la cita no tiene profesional; no se puede validar la disponibilidad, reprográmala desde el CRM" },
      { status: 409 },
    );
  }
  // La duración total (servicio + margen) es la de la cita misma.
  const duracionMin = Math.round((cita.fin.getTime() - cita.inicio.getTime()) / 60_000);
  const libres = await horariosDeDoctor(cfg, { duracionMin, bufferMin: 0 }, cita.doctorId, body.fecha as string, new Date(), cita.id);
  if (!libres.includes(nuevoInicio.toISOString())) {
    return NextResponse.json({ error: "ese horario no está disponible" }, { status: 409 });
  }
  const actualizada = await reprogramarCita(
    bot.orgId,
    { id: cita.id, doctorId: cita.doctorId, inicio: cita.inicio, fin: cita.fin },
    nuevoInicio,
  );
  if (!actualizada) return NextResponse.json({ error: "ese horario acaba de ocuparse" }, { status: 409 });
  await auditarBot(bot, conversacion.id, "cita_reprogramada", {
    entidad: "cita",
    entidadId: cita.id,
    antes: { inicio: cita.inicio, fin: cita.fin },
    despues: { inicio: actualizada.inicio, fin: actualizada.fin, fecha: fechaLocal(actualizada.inicio, cfg.zona) },
  });
  return NextResponse.json(serializar({ cita: actualizada }));
}

async function manejarPATCH(req: NextRequest, props: Props) {
  const { conversationId } = await props.params;
  return conBot(req, "agendar_cita", async (botAutenticado) => {
    const acceso = await conversacionDelBot(botAutenticado, conversationId, "citas");
    if (!acceso.conv) return acceso.respuesta;
    const body = await req.json().catch(() => ({}));
    if (body.fecha !== undefined || body.hora !== undefined) {
      if (body.estado !== undefined) {
        return NextResponse.json({ error: "reprograma o cambia el estado, no ambos a la vez" }, { status: 400 });
      }
      return reprogramar(acceso, body);
    }
    const citaId = aBigInt(String(body.citaId ?? ""));
    if (citaId === null || !ESTADOS_BOT.includes(body.estado)) {
      return NextResponse.json(
        { error: "Se requiere citaId y estado confirmada o cancelada" },
        { status: 400 },
      );
    }
    const cita = await db.cita.findFirst({
      where: { id: citaId, contactoId: acceso.conv.contactoId },
    });
    if (!cita) return NextResponse.json({ error: "cita inexistente" }, { status: 404 });
    const actualizada = await db.cita.update({
      where: { id: cita.id },
      data: { estado: body.estado },
    });
    await auditarBot(acceso.bot, acceso.conv.id, `cita_${body.estado}`, {
      entidad: "cita",
      entidadId: cita.id,
      antes: { estado: cita.estado },
      despues: { estado: actualizada.estado }
    });
    return NextResponse.json(serializar({ cita: actualizada }));
  });
}

export const GET = conErrores(manejarGET);
export const POST = conErrores(manejarPOST);
export const PATCH = conErrores(manejarPATCH);
