import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { transaccionTenant } from "@/lib/retail-db";
import { aBigInt } from "@/lib/ids";
import { exigirGestion, texto } from "@/lib/despacho-api";

type Props = { params: Promise<{ id: string }> };

export const GET = conModulo("despacho", {}, async (_sesion, _req: NextRequest, props: Props) => {
  const id = aBigInt((await props.params).id);
  if (!id || id <= 0n) return NextResponse.json({ error: "Cliente inválido" }, { status: 400 });
  const cliente = await db.despachoCliente.findUnique({
    where: { id },
    include: {
      contacto: { select: { id: true, nombre: true, telefono: true, email: true, empresa: true } },
      procesos: { include: { proceso: { include: { actividades: { where: { activo: true }, orderBy: { orden: "asc" } } } } } },
      actividades: { orderBy: [{ periodo: "desc" }, { fechaLimite: "asc" }], take: 200 },
    },
  });
  return cliente ? NextResponse.json(serializar({ cliente })) : NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
});

export const PATCH = conModulo("despacho", {}, async (sesion, req: NextRequest, props: Props) => {
  const bloqueo = exigirGestion(sesion);
  if (bloqueo) return bloqueo;
  const id = aBigInt((await props.params).id);
  const body = await req.json().catch(() => null);
  if (!id || id <= 0n || !body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const version = Number(body.version);
  if (!Number.isSafeInteger(version) || version < 1) return NextResponse.json({ error: "Versión inválida" }, { status: 400 });
  const result = await transaccionTenant(sesion.orgId!, async (tx) => {
    const actual = await tx.despachoCliente.findUnique({ where: { id } });
    if (!actual) return { error: "Cliente no encontrado", status: 404 } as const;
    if (actual.version !== version) return { error: "El cliente cambió desde que lo abriste. Recarga e intenta de nuevo.", status: 409 } as const;
    const data: Prisma.DespachoClienteUncheckedUpdateInput = {};
    if (body.rfc !== undefined) data.rfc = texto(body.rfc).toUpperCase().slice(0, 13) || null;
    if (body.notas !== undefined) data.notas = texto(body.notas).slice(0, 2000) || null;
    if (body.activo !== undefined) data.activo = body.activo === true;
    if (body.responsableId !== undefined) {
      const responsableId = body.responsableId ? aBigInt(String(body.responsableId)) : null;
      if (body.responsableId && !responsableId) return { error: "Responsable inválido", status: 400 } as const;
      if (responsableId && !(await tx.usuario.findFirst({ where: { id: responsableId, activo: true }, select: { id: true } }))) {
        return { error: "Responsable no encontrado", status: 400 } as const;
      }
      data.responsableId = responsableId;
    }
    if (Array.isArray(body.procesos)) {
      for (const raw of body.procesos) {
        if (!raw || typeof raw !== "object") return { error: "Proceso inválido", status: 400 } as const;
        const procesoId = aBigInt(String((raw as Record<string, unknown>).procesoId ?? ""));
        if (!procesoId) return { error: "Proceso inválido", status: 400 } as const;
        const proceso = await tx.despachoProceso.findFirst({ where: { id: procesoId }, select: { id: true } });
        if (!proceso) return { error: "El proceso no existe en esta organización", status: 400 } as const;
        const crudoResponsable = (raw as Record<string, unknown>).responsableId;
        const responsableId = crudoResponsable ? aBigInt(String(crudoResponsable)) : null;
        if (crudoResponsable && !responsableId) return { error: "Responsable del proceso inválido", status: 400 } as const;
        if (responsableId && !(await tx.usuario.findFirst({ where: { id: responsableId, activo: true }, select: { id: true } }))) {
          return { error: "Responsable del proceso no encontrado", status: 400 } as const;
        }
        await tx.despachoClienteProceso.upsert({
          where: { orgId_clienteId_procesoId: { orgId: sesion.orgId!, clienteId: id, procesoId } },
          update: { responsableId, activo: (raw as Record<string, unknown>).activo !== false },
          create: { clienteId: id, procesoId, responsableId, activo: (raw as Record<string, unknown>).activo !== false },
        });
      }
    }
    await tx.despachoCliente.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
    return {
      cliente: await tx.despachoCliente.findUnique({
        where: { id },
        include: {
          contacto: { select: { id: true, nombre: true, telefono: true, email: true, empresa: true } },
          procesos: { include: { proceso: { include: { actividades: { where: { activo: true }, orderBy: { orden: "asc" } } } } } },
          actividades: { orderBy: [{ periodo: "desc" }, { fechaLimite: "asc" }], take: 200 },
        },
      }),
    } as const;
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(serializar({ cliente: result.cliente }));
});

export const DELETE = conModulo("despacho", {}, async (sesion, _req: NextRequest, props: Props) => {
  const bloqueo = exigirGestion(sesion);
  if (bloqueo) return bloqueo;
  const id = aBigInt((await props.params).id);
  if (!id || id <= 0n) return NextResponse.json({ error: "Cliente inválido" }, { status: 400 });
  const actualizado = await db.despachoCliente.updateMany({ where: { id }, data: { activo: false, version: { increment: 1 } } });
  return actualizado.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
});
