import { NextRequest, NextResponse } from "next/server";
import { botAutorizado, requireBot } from "@/lib/bot-auth";
import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { moduloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";

const ESTADOS_BOT = ["confirmada", "cancelada"] as const;

async function obtenerConversacion(req: NextRequest, conversationId: string) {
  const bot = await requireBot(req);
  if (!bot) return { error: "token inválido", status: 401 } as const;
  if (!(await moduloActivo("citas"))) {
    return { error: "módulo no activo", status: 404 } as const;
  }
  const id = aBigInt(conversationId);
  if (id === null) return { error: "conversationId inválido", status: 400 } as const;
  const conversacion = await db.conversacion.findUnique({ where: { id } });
  if (!conversacion) return { error: "conversación inexistente", status: 404 } as const;
  if (!botAutorizado(bot, conversacion)) {
    return { error: "el bot no opera en este canal", status: 403 } as const;
  }
  return { conversacion } as const;
}

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ accountId: string; conversationId: string }> },
) {
  const { conversationId } = await props.params;
  const acceso = await obtenerConversacion(req, conversationId);
  if ("error" in acceso) {
    return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  }
  const citas = await db.cita.findMany({
    where: {
      contactoId: acceso.conversacion.contactoId,
      inicio: { gte: new Date() },
      estado: { notIn: ["cancelada", "no_asistio"] },
    },
    include: { doctor: true },
    orderBy: { inicio: "asc" },
    take: 10,
  });
  return NextResponse.json(serializar({ citas }));
}

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ accountId: string; conversationId: string }> },
) {
  const { conversationId } = await props.params;
  const acceso = await obtenerConversacion(req, conversationId);
  if ("error" in acceso) {
    return NextResponse.json({ error: acceso.error }, { status: acceso.status });
  }
  const body = await req.json().catch(() => ({}));
  const citaId = aBigInt(String(body.citaId ?? ""));
  if (citaId === null || !ESTADOS_BOT.includes(body.estado)) {
    return NextResponse.json(
      { error: "Se requiere citaId y estado confirmada o cancelada" },
      { status: 400 },
    );
  }
  const cita = await db.cita.findFirst({
    where: { id: citaId, contactoId: acceso.conversacion.contactoId },
  });
  if (!cita) return NextResponse.json({ error: "cita inexistente" }, { status: 404 });
  const actualizada = await db.cita.update({
    where: { id: cita.id },
    data: { estado: body.estado },
  });
  return NextResponse.json(serializar({ cita: actualizada }));
}
