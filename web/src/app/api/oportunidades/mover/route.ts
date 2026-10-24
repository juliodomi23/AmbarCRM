import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { conErrores } from "@/lib/errores-api";
import { aBigInt } from "@/lib/ids";

export const dynamic = "force-dynamic";

/**
 * Mueve una tarjeta a otra etapa y reordena la columna destino.
 * Body: { oportunidadId, etapaIdDestino, ordenIds: Array<number | string> }
 *  - ordenIds = ids de las oportunidades de la columna destino en su orden final.
 */
async function manejarPOST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "no autorizado" }, { status: 401 });

  const { oportunidadId, etapaIdDestino, ordenIds } = await req.json().catch(() => ({}));
  const convertirId = (valor: unknown) =>
    typeof valor === "string" || typeof valor === "number"
      ? aBigInt(String(valor))
      : null;
  const oportunidadBigInt = convertirId(oportunidadId);
  const etapaBigInt = convertirId(etapaIdDestino);
  if (!oportunidadBigInt || !etapaBigInt) {
    return NextResponse.json({ error: "faltan campos" }, { status: 400 });
  }

  const etapa = await db.etapa.findUnique({ where: { id: etapaBigInt } });
  if (!etapa) return NextResponse.json({ error: "etapa inexistente" }, { status: 404 });

  const opAntes = await db.oportunidad.findUnique({ where: { id: oportunidadBigInt } });
  if (!opAntes) return NextResponse.json({ error: "oportunidad inexistente" }, { status: 404 });
  if (opAntes.embudoId !== etapa.embudoId) {
    return NextResponse.json({ error: "la etapa pertenece a otro embudo" }, { status: 400 });
  }

  if (!Array.isArray(ordenIds) || ordenIds.length === 0 || ordenIds.length > 5000) {
    return NextResponse.json({ error: "ordenIds inválido" }, { status: 400 });
  }
  const convertidos = ordenIds.map(convertirId);
  if (convertidos.some((id) => id === null)) {
    return NextResponse.json({ error: "ordenIds inválido" }, { status: 400 });
  }
  const ids = convertidos as bigint[];
  const idsTexto = ids.map(String);
  if (new Set(idsTexto).size !== ids.length || !ids.includes(oportunidadBigInt)) {
    return NextResponse.json({ error: "ordenIds inválido" }, { status: 400 });
  }
  const idsDestino = ids.filter((id) => id !== oportunidadBigInt);
  const existentes = await db.oportunidad.findMany({
    where: { etapaId: etapa.id, id: { in: idsDestino } },
    select: { id: true },
  });
  if (existentes.length !== idsDestino.length) {
    return NextResponse.json({ error: "ordenIds inválido" }, { status: 400 });
  }

  const estado = etapa.tipo === "ganado" ? "ganado" : etapa.tipo === "perdido" ? "perdido" : "abierto";
  const closedAt = etapa.tipo === "normal" ? null : new Date();

  await db.$transaction(async (tx) => {
    // 1. Mover la tarjeta a la etapa destino + actualizar estado si es terminal.
    await tx.oportunidad.update({
      where: { id: oportunidadBigInt },
      data: { etapaId: etapa.id, estado, closedAt }
    });

    // 2. Reordenar la columna destino (orden espaciado 10,20,30…).
    const restantes = await tx.oportunidad.findMany({
      where: { etapaId: etapa.id, id: { notIn: ids } },
      orderBy: [{ orden: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    const ordenCompleto = [...ids, ...restantes.map(({ id }) => id)];
    for (let i = 0; i < ordenCompleto.length; i++) {
      await tx.oportunidad.updateMany({
        where: { id: ordenCompleto[i], etapaId: etapa.id },
        data: { orden: (i + 1) * 10 },
      });
    }

    // 3. Timeline si cambió de etapa.
    if (opAntes.etapaId !== etapa.id) {
      await tx.evento.create({
        data: {
          oportunidadId: oportunidadBigInt,
          tipo: etapa.tipo === "ganado" ? "ganada" : etapa.tipo === "perdido" ? "perdida" : "etapa_cambio",
          descripcion: `Movida a "${etapa.nombre}"`,
          usuarioId: session.user.id ? BigInt(session.user.id) : null
        }
      });
    }
  });

  return NextResponse.json({ ok: true });
}

export const POST = conErrores(manejarPOST);
