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
  const motivo = typeof body?.motivo === "string" ? body.motivo.trim().slice(0, 1000) : "";
  if (!id || id <= 0n || !Number.isSafeInteger(version) || version < 1) {
    return NextResponse.json({ error: "Actividad o versión inválida" }, { status: 400 });
  }
  if (!motivo) {
    return NextResponse.json({ error: "El motivo del rechazo es obligatorio" }, { status: 400 });
  }
  const modulo = await db.moduloOrg.findFirst({
    where: { clave: "despacho", activo: true },
    select: { config: true },
  });
  if (!puedeConfirmarActividadDespacho({ id: sesion.userId, puesto: sesion.puesto, rol: sesion.rol }, modulo?.config)) {
    return NextResponse.json({ error: "No tienes permiso para rechazar actividades" }, { status: 403 });
  }
  if (!sesion.orgId) return NextResponse.json({ error: "Organización inválida" }, { status: 401 });

  const resultado = await transaccionTenant(sesion.orgId, async (tx) => {
    const actividad = await tx.despachoActividad.findUnique({ where: { id } });
    if (!actividad) return { error: "Actividad no encontrada", status: 404 } as const;
    if (actividad.version !== version) return { error: "La actividad cambió desde que la abriste. Actualiza e intenta de nuevo.", status: 409 } as const;
    if (actividad.estado !== "completada") return { error: "Solo se pueden rechazar actividades completadas", status: 409 } as const;

    await tx.despachoActividad.update({
      where: { id },
      data: { estado: "en_proceso", completadaAt: null, version: { increment: 1 } },
    });
    await tx.despachoActividadCambio.create({
      data: {
        actividadId: id, estadoAnterior: "completada", estadoNuevo: "en_proceso", userId: sesion.userId,
        nota: `Rechazada: ${motivo}`,
      },
    });
    if (actividad.responsableId) {
      await tx.notificacion.create({
        data: {
          usuarioId: actividad.responsableId,
          titulo: `Actividad rechazada: ${actividad.titulo}`,
          cuerpo: motivo,
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
