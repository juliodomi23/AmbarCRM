import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { transaccionTenant } from "@/lib/retail-db";
import { aBigInt } from "@/lib/ids";
import { puedeConfirmarActividadDespacho } from "@/lib/despacho";

type Props = { params: Promise<{ id: string }> };

export const POST = conModulo("despacho", {}, async (sesion, req: NextRequest, props: Props) => {
  const id = aBigInt((await props.params).id);
  const body = await req.json().catch(() => null);
  const version = Number(body?.version);
  if (!id || id <= 0n || !Number.isSafeInteger(version) || version < 1) {
    return NextResponse.json({ error: "Actividad o versión inválida" }, { status: 400 });
  }
  const calificacion = body?.calificacion === undefined || body?.calificacion === null ? null : Number(body.calificacion);
  if (calificacion !== null && (!Number.isSafeInteger(calificacion) || calificacion < 1)) {
    return NextResponse.json({ error: "La calificación debe ser un entero mayor a 0" }, { status: 400 });
  }
  const calificacionNota = typeof body?.calificacionNota === "string" ? body.calificacionNota.trim().slice(0, 1000) || null : null;
  const respuesta = typeof body?.respuesta === "string" ? body.respuesta.trim().slice(0, 1000) || null : null;
  const modulo = await db.moduloOrg.findFirst({ where: { clave: "despacho", activo: true }, select: { config: true } });
  if (!puedeConfirmarActividadDespacho({ id: sesion.userId, puesto: sesion.puesto, rol: sesion.rol }, modulo?.config)) {
    return NextResponse.json({ error: "No tienes permiso para resolver apelaciones" }, { status: 403 });
  }
  if (!sesion.orgId) return NextResponse.json({ error: "Organización inválida" }, { status: 401 });

  const resultado = await transaccionTenant(sesion.orgId, async (tx) => {
    const actividad = await tx.despachoActividad.findUnique({ where: { id } });
    if (!actividad) return { error: "Actividad no encontrada", status: 404 } as const;
    if (actividad.version !== version) return { error: "La actividad cambió desde que la abriste. Actualiza e intenta de nuevo.", status: 409 } as const;
    if (actividad.apelacionEstado !== "pendiente") return { error: "Esta actividad no tiene una apelación pendiente", status: 409 } as const;
    if (calificacion !== null && calificacion > actividad.peso) {
      return { error: `La calificación no puede ser mayor al valor de la actividad (${actividad.peso})`, status: 400 } as const;
    }

    await tx.despachoActividad.update({
      where: { id },
      data: {
        ...(calificacion !== null ? { calificacion, calificacionNota } : {}),
        apelacionEstado: "resuelta",
        apelacionRespuesta: respuesta,
        apelacionResueltaAt: new Date(),
        apelacionResueltaPorId: sesion.userId,
        version: { increment: 1 },
      },
    });
    await tx.despachoActividadCambio.create({
      data: {
        actividadId: id, estadoAnterior: actividad.estado, estadoNuevo: actividad.estado,
        userId: sesion.userId,
        nota: `Apelación resuelta · Calidad ${calificacion ?? actividad.calificacion ?? "—"}/${actividad.peso}${respuesta ? `: ${respuesta}` : ""}`,
      },
    });
    if (actividad.responsableId) {
      await tx.notificacion.create({
        data: {
          usuarioId: actividad.responsableId,
          titulo: `Apelación resuelta: ${actividad.titulo}`,
          cuerpo: respuesta ?? `Nueva calificación: ${calificacion ?? actividad.calificacion ?? "sin cambio"}/${actividad.peso}`,
          enlace: `/despacho/mi-trabajo?actividad=${id}`,
        },
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
