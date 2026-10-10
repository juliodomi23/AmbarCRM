import { NextRequest, NextResponse } from "next/server";
import { conBot, conversacionDelBot } from "@/lib/bot-auth";
import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { conErrores } from "@/lib/errores-api";
import { fechaValida } from "@/lib/reservas/horarios";
import {
  configReservasEmpresa,
  doctoresDelServicio,
  fechaEnAgenda,
  horariosDeDoctor,
  horariosPorDoctor,
  unionHorarios,
} from "@/lib/reservas/servidor";

export const dynamic = "force-dynamic";

function horaLocal(iso: string, zona: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: zona, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

/**
 * Horarios libres de un día. Usa el mismo motor que las reservas en línea (horario del profesional,
 * duración del servicio y citas existentes).
 * GET …/appointments/availability?fecha=YYYY-MM-DD[&profesionalId=][&servicioId=]
 * Sin servicioId: si hay un solo servicio activo se usa; si hay varios, 400 con la lista.
 */
async function manejarGET(req: NextRequest, props: { params: Promise<{ accountId: string; conversationId: string }> }) {
  const { conversationId } = await props.params;
  return conBot(req, async (botAutenticado) => {
    const acceso = await conversacionDelBot(botAutenticado, conversationId, "citas");
    if (!acceso.conv) return acceso.respuesta;

    const q = req.nextUrl.searchParams;
    const cfg = await configReservasEmpresa();
    const fecha = q.get("fecha");
    if (!fechaValida(fecha)) return NextResponse.json({ error: "fecha requerida (YYYY-MM-DD)" }, { status: 400 });
    if (!fechaEnAgenda(cfg, fecha)) {
      return NextResponse.json({ error: `fecha fuera de la agenda (hoy a ${cfg.ventanaDias} días)` }, { status: 400 });
    }
    const servicioTexto = q.get("servicioId");
    const servicioId = servicioTexto ? aBigInt(servicioTexto) : null;
    if (servicioTexto && servicioId === null) return NextResponse.json({ error: "servicioId inválido" }, { status: 400 });
    const profesionalTexto = q.get("profesionalId");
    const profesionalId = profesionalTexto ? aBigInt(profesionalTexto) : null;
    if (profesionalTexto && profesionalId === null) return NextResponse.json({ error: "profesionalId inválido" }, { status: 400 });

    const activos = await db.servicioReserva.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } });
    const servicio = servicioId !== null ? activos.find((s) => s.id === servicioId) : activos.length === 1 ? activos[0] : undefined;
    if (!servicio) {
      if (servicioId !== null) return NextResponse.json({ error: "servicio no disponible" }, { status: 404 });
      if (activos.length === 0) return NextResponse.json({ error: "no hay servicios configurados" }, { status: 404 });
      return NextResponse.json(
        {
          error: "servicioId requerido",
          servicios: activos.map((s) => ({ id: s.id.toString(), nombre: s.nombre, duracionMin: s.duracionMin })),
        },
        { status: 400 },
      );
    }

    const profesionales = await doctoresDelServicio(servicio.id);
    const elegibles = profesionales.map((d) => d.id);
    if (profesionalId !== null && !elegibles.includes(profesionalId)) {
      return NextResponse.json({ error: "profesional no disponible para este servicio" }, { status: 400 });
    }
    const iso =
      profesionalId !== null
        ? await horariosDeDoctor(cfg, servicio, profesionalId, fecha)
        : unionHorarios(await horariosPorDoctor(cfg, servicio, fecha, elegibles));

    return NextResponse.json({
      fecha,
      zona: cfg.zona,
      servicio: { id: servicio.id.toString(), nombre: servicio.nombre, duracionMin: servicio.duracionMin },
      profesionalId: profesionalId?.toString() ?? null,
      profesionales: profesionales.map((d) => ({ id: d.id.toString(), nombre: d.nombre })),
      horarios: iso.map((inicio) => ({ hora: horaLocal(inicio, cfg.zona), inicio })),
    });
  });
}

export const GET = conErrores(manejarGET);
