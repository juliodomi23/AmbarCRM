import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Mueve una tarjeta a otra etapa y reordena la columna destino.
 * Body: { oportunidadId, etapaIdDestino, ordenIds: number[] }
 *  - ordenIds = ids de las oportunidades de la columna destino en su orden final.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "no autorizado" }, { status: 401 });

  const { oportunidadId, etapaIdDestino, ordenIds } = await req.json().catch(() => ({}));
  if (!oportunidadId || !etapaIdDestino) {
    return NextResponse.json({ error: "faltan campos" }, { status: 400 });
  }

  const etapa = await db.etapa.findUnique({ where: { id: BigInt(etapaIdDestino) } });
  if (!etapa) return NextResponse.json({ error: "etapa inexistente" }, { status: 404 });

  const opAntes = await db.oportunidad.findUnique({ where: { id: BigInt(oportunidadId) } });
  if (!opAntes) return NextResponse.json({ error: "oportunidad inexistente" }, { status: 404 });

  const estado = etapa.tipo === "ganado" ? "ganado" : etapa.tipo === "perdido" ? "perdido" : "abierto";
  const closedAt = etapa.tipo === "normal" ? null : new Date();

  await db.$transaction(async (tx) => {
    // 1. Mover la tarjeta a la etapa destino + actualizar estado si es terminal.
    await tx.oportunidad.update({
      where: { id: BigInt(oportunidadId) },
      data: { etapaId: etapa.id, estado, closedAt }
    });

    // 2. Reordenar la columna destino (orden espaciado 10,20,30…).
    const ids: number[] = Array.isArray(ordenIds) ? ordenIds : [];
    for (let i = 0; i < ids.length; i++) {
      await tx.oportunidad.update({ where: { id: BigInt(ids[i]) }, data: { orden: (i + 1) * 10 } });
    }

    // 3. Timeline si cambió de etapa.
    if (opAntes.etapaId !== etapa.id) {
      await tx.evento.create({
        data: {
          oportunidadId: BigInt(oportunidadId),
          tipo: etapa.tipo === "ganado" ? "ganada" : etapa.tipo === "perdido" ? "perdida" : "etapa_cambio",
          descripcion: `Movida a "${etapa.nombre}"`,
          usuarioId: session.user.id ? BigInt(session.user.id) : null
        }
      });
    }
  });

  return NextResponse.json({ ok: true });
}
