import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { transaccionTenant } from "@/lib/retail-db";
import { aBigInt } from "@/lib/ids";
import { exigirGestion, fechaCivil, texto, aFecha } from "@/lib/despacho-api";
import { ESTADOS_DESPACHO, idsPermisoDespacho, puedeGestionarDespacho, puedeVerTodasActividadesDespacho, transicionDespachoValida } from "@/lib/despacho";

type Props = { params: Promise<{ id: string }> };

export const GET = conModulo("despacho", {}, async (sesion, _req: NextRequest, props: Props) => {
  const id = aBigInt((await props.params).id);
  if (!id || id <= 0n) return NextResponse.json({ error: "Actividad inválida" }, { status: 400 });
  const actividad = await db.despachoActividad.findUnique({
    where: { id },
    include: {
      cliente: { include: { contacto: { select: { id: true, nombre: true, empresa: true, telefono: true } } } },
      cambios: { orderBy: { creadoAt: "asc" } },
    },
  });
  const modulo = await db.moduloOrg.findFirst({ where: { clave: "despacho", activo: true }, select: { config: true } });
  if (actividad && !puedeVerTodasActividadesDespacho({ id: sesion.userId, puesto: sesion.puesto, rol: sesion.rol }, modulo?.config) && String(actividad.responsableId ?? "") !== String(sesion.userId ?? "")) {
    return NextResponse.json({ error: "Actividad no encontrada" }, { status: 404 });
  }
  return actividad ? NextResponse.json(serializar({ actividad })) : NextResponse.json({ error: "Actividad no encontrada" }, { status: 404 });
});

export const PATCH = conModulo("despacho", {}, async (sesion, req: NextRequest, props: Props) => {
  const id = aBigInt((await props.params).id);
  const body = await req.json().catch(() => null);
  if (!id || id <= 0n || !body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const version = Number(body.version);
  if (!Number.isSafeInteger(version) || version < 1) return NextResponse.json({ error: "Versión inválida" }, { status: 400 });
  const gestiona = puedeGestionarDespacho(sesion.puesto, sesion.rol);
  const result = await transaccionTenant(sesion.orgId!, async (tx) => {
    const actual = await tx.despachoActividad.findUnique({ where: { id } });
    if (!actual) return { error: "Actividad no encontrada", status: 404 } as const;
    if (actual.version !== version) return { error: "La actividad cambió desde que la abriste. Recarga e intenta de nuevo.", status: 409 } as const;
    if (!gestiona) {
      if (sesion.userId === null || String(actual.responsableId ?? "") !== String(sesion.userId)) {
        return { error: "Solo puedes actualizar tus propias actividades", status: 403 } as const;
      }
      if (body.responsableId !== undefined || body.fechaLimite !== undefined || body.titulo !== undefined) {
        return { error: "Solo dirección puede reasignar o cambiar los datos de la actividad", status: 403 } as const;
      }
    }
    const data: Prisma.DespachoActividadUncheckedUpdateInput = {};
    const estadoSiguiente = body.estado === undefined ? actual.estado : texto(body.estado);
    if (body.estado !== undefined && !ESTADOS_DESPACHO.includes(estadoSiguiente as (typeof ESTADOS_DESPACHO)[number])) {
      return { error: "Estado inválido", status: 400 } as const;
    }
    if (!transicionDespachoValida(actual.estado, estadoSiguiente)) {
      return { error: `No se permite cambiar de ${actual.estado} a ${estadoSiguiente}`, status: 409 } as const;
    }
    if (body.estado !== undefined) {
      data.estado = estadoSiguiente;
      data.completadaAt = estadoSiguiente === "completada" ? new Date() : null;
      data.confirmadaAt = null;
      data.confirmadaPorId = null;
    }
    if (body.titulo !== undefined) {
      const titulo = texto(body.titulo).slice(0, 200);
      if (!titulo) return { error: "El título es obligatorio", status: 400 } as const;
      data.titulo = titulo;
    }
    if (body.notas !== undefined) data.notas = texto(body.notas).slice(0, 2000) || null;
    if (body.peso !== undefined) {
      const peso = Number(body.peso);
      if (!Number.isSafeInteger(peso) || peso < 1) return { error: "El valor (peso) debe ser un entero mayor a 0", status: 400 } as const;
      data.peso = peso;
    }
    if (body.fechaLimite !== undefined) {
      const fechaLimite = fechaCivil(body.fechaLimite);
      if (!fechaLimite) return { error: "Fecha límite inválida", status: 400 } as const;
      data.fechaLimite = aFecha(fechaLimite);
    }
    if (body.responsableId !== undefined) {
      const responsableId = body.responsableId ? aBigInt(String(body.responsableId)) : null;
      if (body.responsableId && !responsableId) return { error: "Responsable inválido", status: 400 } as const;
      if (responsableId && !(await tx.usuario.findFirst({ where: { id: responsableId, activo: true }, select: { id: true } }))) {
        return { error: "Responsable no encontrado", status: 400 } as const;
      }
      data.responsableId = responsableId;
    }
    await tx.despachoActividad.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
    if (estadoSiguiente !== actual.estado) {
      await tx.despachoActividadCambio.create({
        data: {
          actividadId: id, estadoAnterior: actual.estado, estadoNuevo: estadoSiguiente,
          userId: sesion.userId, nota: texto(body.nota).slice(0, 500) || null,
        },
      });
      if (estadoSiguiente === "completada" && actual.requiereConfirmacion) {
        const modulo = await tx.moduloOrg.findFirst({ where: { clave: "despacho", activo: true }, select: { config: true } });
        const confirmadorIds = idsPermisoDespacho(modulo?.config, "usuariosConfirmadores");
        if (confirmadorIds.length) {
          await tx.notificacion.createMany({
            data: confirmadorIds.map((idStr) => ({
              usuarioId: BigInt(idStr),
              titulo: `Actividad por confirmar: ${actual.titulo}`,
              enlace: `/despacho/revision?actividad=${id}`,
            })),
          });
        }
      }
    }
    return {
      actividad: await tx.despachoActividad.findUnique({
        where: { id },
        include: {
          cliente: { include: { contacto: { select: { id: true, nombre: true, empresa: true, telefono: true } } } },
          cambios: { orderBy: { creadoAt: "asc" } },
        },
      }),
    } as const;
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(serializar({ actividad: result.actividad }));
});

export const DELETE = conModulo("despacho", {}, async (sesion, _req: NextRequest, props: Props) => {
  const bloqueo = exigirGestion(sesion);
  if (bloqueo) return bloqueo;
  const id = aBigInt((await props.params).id);
  if (!id || id <= 0n) return NextResponse.json({ error: "Actividad inválida" }, { status: 400 });
  const eliminada = await db.despachoActividad.deleteMany({ where: { id } });
  return eliminada.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Actividad no encontrada" }, { status: 404 });
});
