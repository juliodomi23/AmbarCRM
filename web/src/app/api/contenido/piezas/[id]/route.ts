import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { transaccionTenant } from "@/lib/retail-db";
import { aBigInt } from "@/lib/ids";
import { texto } from "@/lib/despacho-api";
import { referenciaPropia } from "@/lib/referencias";
import {
  CANALES_CONTENIDO, ESTADOS_CONTENIDO, FORMATOS_CONTENIDO,
  debeVolverARevision, puedeAprobar, puedeEditarPieza, transicionContenidoValida, validarEnlaceMaterial,
} from "@/lib/contenido";

type Props = { params: Promise<{ id: string }> };

export const GET = conModulo("contenido", {}, async (_sesion, _req: NextRequest, props: Props) => {
  const id = aBigInt((await props.params).id);
  if (!id || id <= 0n) return NextResponse.json({ error: "Pieza inválida" }, { status: 400 });
  const pieza = await db.contenidoPieza.findUnique({
    where: { id },
    include: {
      comentarios: { orderBy: { creadoAt: "asc" } },
      cambios: { orderBy: { creadoAt: "asc" } },
      contacto: { select: { id: true, nombre: true, empresa: true } },
    },
  });
  return pieza ? NextResponse.json(serializar({ pieza })) : NextResponse.json({ error: "Pieza no encontrada" }, { status: 404 });
});

export const PATCH = conModulo("contenido", {}, async (sesion, req: NextRequest, props: Props) => {
  const id = aBigInt((await props.params).id);
  const body = await req.json().catch(() => null);
  if (!id || id <= 0n || !body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const version = Number(body.version);
  if (!Number.isSafeInteger(version) || version < 1) return NextResponse.json({ error: "Versión inválida" }, { status: 400 });
  const result = await transaccionTenant(sesion.orgId!, async (tx) => {
    const actual = await tx.contenidoPieza.findUnique({ where: { id } });
    if (!actual) return { error: "Pieza no encontrada", status: 404 } as const;
    if (actual.version !== version) return { error: "La pieza cambió desde que la abriste. Recarga e intenta de nuevo.", status: 409 } as const;
    if (!puedeEditarPieza(actual, sesion.userId, sesion.puesto, sesion.rol)) {
      return { error: "No tienes permiso para editar esta pieza", status: 403 } as const;
    }
    const data: Prisma.ContenidoPiezaUncheckedUpdateInput = {};
    let estadoFinal = actual.estado;
    if (body.estado !== undefined) {
      const siguiente = texto(body.estado);
      if (!ESTADOS_CONTENIDO.includes(siguiente as (typeof ESTADOS_CONTENIDO)[number])) {
        return { error: "Estado inválido", status: 400 } as const;
      }
      if (!transicionContenidoValida(actual.estado, siguiente)) {
        return { error: `No se permite cambiar de ${actual.estado} a ${siguiente}`, status: 409 } as const;
      }
      if (siguiente === "aprobado" && !puedeAprobar(actual, sesion.userId, sesion.puesto, sesion.rol)) {
        return { error: "Solo dirección o el revisor asignado puede aprobar", status: 403 } as const;
      }
      estadoFinal = siguiente;
    }
    if (body.titulo !== undefined) {
      const titulo = texto(body.titulo).slice(0, 200);
      if (!titulo) return { error: "El título es obligatorio", status: 400 } as const;
      data.titulo = titulo;
    }
    if (body.canal !== undefined) {
      const canal = texto(body.canal);
      if (!CANALES_CONTENIDO.includes(canal as (typeof CANALES_CONTENIDO)[number])) return { error: "Canal inválido", status: 400 } as const;
      data.canal = canal;
    }
    if (body.formato !== undefined) {
      const formato = texto(body.formato);
      if (!FORMATOS_CONTENIDO.includes(formato as (typeof FORMATOS_CONTENIDO)[number])) return { error: "Formato inválido", status: 400 } as const;
      data.formato = formato;
    }
    if (body.copy !== undefined) {
      const copy = texto(body.copy).slice(0, 10000);
      if (body.estado === undefined && debeVolverARevision(actual.estado, actual.copy, copy)) estadoFinal = "revision";
      data.copy = copy;
    }
    if (body.enlaceMaterial !== undefined) {
      if (!validarEnlaceMaterial(body.enlaceMaterial)) return { error: "El enlace del material debe ser https", status: 400 } as const;
      data.enlaceMaterial = texto(body.enlaceMaterial) || null;
    }
    if (body.notasDiseno !== undefined) data.notasDiseno = texto(body.notasDiseno).slice(0, 2000) || null;
    if (body.fechaPublicacion !== undefined) {
      if (body.fechaPublicacion === null || body.fechaPublicacion === "") {
        data.fechaPublicacion = null;
      } else {
        const fecha = new Date(String(body.fechaPublicacion));
        if (Number.isNaN(fecha.getTime())) return { error: "Fecha de publicación inválida", status: 400 } as const;
        data.fechaPublicacion = fecha;
      }
    }
    if (body.campanaId !== undefined) {
      const campanaId = await referenciaPropia("campana", body.campanaId);
      if (campanaId === false) return { error: "La campaña no pertenece a esta organización", status: 400 } as const;
      data.campanaId = campanaId;
    }
    if (body.contactoId !== undefined) {
      const contactoId = await referenciaPropia("contacto", body.contactoId);
      if (contactoId === false) return { error: "El contacto no pertenece a esta organización", status: 400 } as const;
      data.contactoId = contactoId;
    }
    if (body.redactorId !== undefined) {
      const redactorId = await referenciaPropia("usuario", body.redactorId);
      if (redactorId === false) return { error: "Redactor no encontrado", status: 400 } as const;
      data.redactorId = redactorId;
    }
    if (body.revisorId !== undefined) {
      const revisorId = await referenciaPropia("usuario", body.revisorId);
      if (revisorId === false) return { error: "Revisor no encontrado", status: 400 } as const;
      data.revisorId = revisorId;
    }
    if (estadoFinal === "programado" && !(data.fechaPublicacion ?? actual.fechaPublicacion)) {
      return { error: "Para programar una pieza primero define la fecha de publicación", status: 400 } as const;
    }
    if (estadoFinal !== actual.estado) {
      data.estado = estadoFinal;
      data.publicadaAt = estadoFinal === "publicado" ? new Date() : actual.publicadaAt;
    }
    await tx.contenidoPieza.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
    if (estadoFinal !== actual.estado) {
      const nota = texto(body.nota).slice(0, 500) || null;
      await tx.contenidoCambio.create({
        data: { piezaId: id, estadoAnterior: actual.estado, estadoNuevo: estadoFinal, userId: sesion.userId, nota },
      });
      if (estadoFinal === "cambios" && actual.redactorId) {
        await tx.notificacion.create({
          data: {
            usuarioId: actual.redactorId,
            titulo: `Pieza con cambios: ${actual.titulo}`,
            cuerpo: nota,
            enlace: `/contenido?pieza=${id}`,
          },
        });
      }
    }
    return {
      pieza: await tx.contenidoPieza.findUnique({
        where: { id },
        include: {
          comentarios: { orderBy: { creadoAt: "asc" } },
          cambios: { orderBy: { creadoAt: "asc" } },
          contacto: { select: { id: true, nombre: true, empresa: true } },
        },
      }),
    } as const;
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(serializar({ pieza: result.pieza }));
});

export const DELETE = conModulo("contenido", {}, async (sesion, _req: NextRequest, props: Props) => {
  const id = aBigInt((await props.params).id);
  if (!id || id <= 0n) return NextResponse.json({ error: "Pieza inválida" }, { status: 400 });
  const actual = await db.contenidoPieza.findUnique({ where: { id }, select: { redactorId: true, revisorId: true, estado: true } });
  if (!actual) return NextResponse.json({ error: "Pieza no encontrada" }, { status: 404 });
  if (!puedeEditarPieza(actual, sesion.userId, sesion.puesto, sesion.rol) || actual.estado === "publicado") {
    return NextResponse.json({ error: "No puedes eliminar esta pieza" }, { status: 403 });
  }
  await db.contenidoPieza.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
});
