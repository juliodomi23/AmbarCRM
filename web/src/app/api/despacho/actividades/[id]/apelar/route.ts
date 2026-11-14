import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { serializar } from "@/lib/serialize";
import { transaccionTenant } from "@/lib/retail-db";
import { aBigInt } from "@/lib/ids";
import { idsPermisoDespacho, puedeApelarCalificacion } from "@/lib/despacho";

type Props = { params: Promise<{ id: string }> };

export const POST = conModulo("despacho", {}, async (sesion, req: NextRequest, props: Props) => {
  const id = aBigInt((await props.params).id);
  const body = await req.json().catch(() => null);
  const version = Number(body?.version);
  const comentario = typeof body?.comentario === "string" ? body.comentario.trim().slice(0, 1000) : "";
  if (!id || id <= 0n || !Number.isSafeInteger(version) || version < 1) {
    return NextResponse.json({ error: "Actividad o versión inválida" }, { status: 400 });
  }
  if (!comentario) {
    return NextResponse.json({ error: "Escribe el motivo de la apelación" }, { status: 400 });
  }
  if (!sesion.orgId) return NextResponse.json({ error: "Organización inválida" }, { status: 401 });

  const resultado = await transaccionTenant(sesion.orgId, async (tx) => {
    const actividad = await tx.despachoActividad.findUnique({ where: { id } });
    if (!actividad) return { error: "Actividad no encontrada", status: 404 } as const;
    if (actividad.version !== version) return { error: "La actividad cambió desde que la abriste. Actualiza e intenta de nuevo.", status: 409 } as const;
    if (!puedeApelarCalificacion(actividad, sesion.userId)) {
      return { error: "Solo puedes apelar una calificación confirmada de tus propias actividades", status: 403 } as const;
    }

    await tx.despachoActividad.update({
      where: { id },
      data: {
        apelacionComentario: comentario,
        apelacionEstado: "pendiente",
        apelacionRespuesta: null,
        apelacionCreadaAt: new Date(),
        apelacionResueltaAt: null,
        apelacionResueltaPorId: null,
        version: { increment: 1 },
      },
    });
    await tx.despachoActividadCambio.create({
      data: {
        actividadId: id, estadoAnterior: actividad.estado, estadoNuevo: actividad.estado,
        userId: sesion.userId, nota: `Apelación de calificación: ${comentario}`,
      },
    });
    const modulo = await tx.moduloOrg.findFirst({ where: { clave: "despacho", activo: true }, select: { config: true } });
    const confirmadores = idsPermisoDespacho(modulo?.config, "usuariosConfirmadores");
    if (confirmadores.length) {
      await tx.notificacion.createMany({
        data: confirmadores.map((usuarioId) => ({
          usuarioId: BigInt(usuarioId),
          titulo: `Apelación de calificación: ${actividad.titulo}`,
          cuerpo: comentario,
          enlace: `/despacho/revision?apelacion=${id}`,
        })),
      });
    }
    return {
      actividad: await tx.despachoActividad.findUnique({
        where: { id },
        include: { cliente: { include: { contacto: { select: { id: true, nombre: true, empresa: true } } } }, cambios: { orderBy: { creadoAt: "asc" } } },
      }),
    } as const;
  });
  if ("error" in resultado) return NextResponse.json({ error: resultado.error }, { status: resultado.status });
  return NextResponse.json(serializar({ actividad: resultado.actividad }));
});
