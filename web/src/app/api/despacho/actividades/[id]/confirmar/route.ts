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
  if (calificacion !== null && (!Number.isSafeInteger(calificacion) || calificacion < 1 || calificacion > 5)) {
    return NextResponse.json({ error: "La calificación debe ser un entero del 1 al 5" }, { status: 400 });
  }
  const calificacionNota = typeof body?.calificacionNota === "string" ? body.calificacionNota.trim().slice(0, 1000) || null : null;
  const modulo = await db.moduloOrg.findFirst({
    where: { clave: "despacho", activo: true },
    select: { config: true },
  });
  if (!puedeConfirmarActividadDespacho({ id: sesion.userId, puesto: sesion.puesto, rol: sesion.rol }, modulo?.config)) {
    return NextResponse.json({ error: "No tienes permiso para confirmar actividades" }, { status: 403 });
  }
  if (!sesion.orgId) return NextResponse.json({ error: "Organización inválida" }, { status: 401 });

  const resultado = await transaccionTenant(sesion.orgId, async (tx) => {
    const actividad = await tx.despachoActividad.findUnique({ where: { id } });
    if (!actividad) return { error: "Actividad no encontrada", status: 404 } as const;
    if (actividad.version !== version) return { error: "La actividad cambió desde que la abriste. Actualiza e intenta de nuevo.", status: 409 } as const;
    if (actividad.estado !== "completada") return { error: "Solo se pueden confirmar actividades completadas", status: 409 } as const;
    if (!actividad.requiereConfirmacion || actividad.confirmadaAt) {
      return { actividad: await tx.despachoActividad.findUnique({ where: { id }, include: { cliente: { include: { contacto: { select: { id: true, nombre: true, empresa: true } } } }, cambios: { orderBy: { creadoAt: "asc" } } } }) } as const;
    }

    await tx.despachoActividad.update({
      where: { id },
      data: { confirmadaAt: new Date(), confirmadaPorId: sesion.userId, calificacion, calificacionNota, version: { increment: 1 } },
    });
    await tx.despachoActividadCambio.create({
      data: {
        actividadId: id, estadoAnterior: "completada", estadoNuevo: "completada", userId: sesion.userId,
        nota: calificacion ? `Confirmación aprobada · Calidad ${calificacion}/5${calificacionNota ? `: ${calificacionNota}` : ""}` : "Confirmación aprobada",
      },
    });
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
