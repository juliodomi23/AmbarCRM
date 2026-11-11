import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { transaccionTenant } from "@/lib/retail-db";
import { aBigInt } from "@/lib/ids";
import { exigirGestion, texto } from "@/lib/despacho-api";
import { PERIODICIDADES } from "@/lib/despacho";

type Props = { params: Promise<{ id: string }> };

export const PATCH = conModulo("despacho", {}, async (sesion, req: NextRequest, props: Props) => {
  const bloqueo = exigirGestion(sesion);
  if (bloqueo) return bloqueo;
  const id = aBigInt((await props.params).id);
  const body = await req.json().catch(() => null);
  if (!id || id <= 0n || !body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const result = await transaccionTenant(sesion.orgId!, async (tx) => {
    const actual = await tx.despachoProceso.findUnique({ where: { id } });
    if (!actual) return { error: "Proceso no encontrado", status: 404 } as const;
    const data: Prisma.DespachoProcesoUpdateInput = {};
    if (body.nombre !== undefined) {
      const nombre = texto(body.nombre).slice(0, 120);
      if (!nombre) return { error: "El nombre es obligatorio", status: 400 } as const;
      data.nombre = nombre;
    }
    if (body.periodicidad !== undefined) {
      const periodicidad = texto(body.periodicidad);
      if (!PERIODICIDADES.includes(periodicidad as (typeof PERIODICIDADES)[number])) {
        return { error: "Periodicidad inválida", status: 400 } as const;
      }
      data.periodicidad = periodicidad;
    }
    if (body.activo !== undefined) data.activo = body.activo === true;
    if (Array.isArray(body.actividades)) {
      if (body.actividades.length > 100) return { error: "Demasiadas actividades", status: 400 } as const;
      const vistos: bigint[] = [];
      for (const [indice, raw] of body.actividades.entries()) {
        if (!raw || typeof raw !== "object") return { error: "Actividad inválida", status: 400 } as const;
        const dato = raw as Record<string, unknown>;
        const nombreActividad = texto(dato.nombre).slice(0, 160);
        const diaLimite = Number(dato.diaLimite ?? 1);
        if (!nombreActividad || !Number.isSafeInteger(diaLimite) || diaLimite < 1 || diaLimite > 31) {
          return { error: "Revisa el nombre y el día límite de cada actividad", status: 400 } as const;
        }
        const actividadId = dato.id ? aBigInt(String(dato.id)) : null;
        if (dato.id && !actividadId) return { error: "Actividad inválida", status: 400 } as const;
        if (actividadId) {
          const actualizada = await tx.despachoProcesoActividad.updateMany({
            where: { id: actividadId, procesoId: id },
            data: { nombre: nombreActividad, diaLimite, orden: indice, activo: dato.activo !== false },
          });
          if (!actualizada.count) return { error: "La actividad no pertenece al proceso", status: 400 } as const;
          vistos.push(actividadId);
        } else {
          const creada = await tx.despachoProcesoActividad.create({ data: { procesoId: id, nombre: nombreActividad, diaLimite, orden: indice } });
          vistos.push(creada.id);
        }
      }
      await tx.despachoProcesoActividad.updateMany({
        where: { procesoId: id, id: { notIn: vistos } },
        data: { activo: false },
      });
    }
    await tx.despachoProceso.update({ where: { id }, data });
    return {
      proceso: await tx.despachoProceso.findUnique({
        where: { id },
        include: { actividades: { orderBy: [{ orden: "asc" }, { id: "asc" }] } },
      }),
    } as const;
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(serializar({ proceso: result.proceso }));
});

export const DELETE = conModulo("despacho", {}, async (sesion, _req: NextRequest, props: Props) => {
  const bloqueo = exigirGestion(sesion);
  if (bloqueo) return bloqueo;
  const id = aBigInt((await props.params).id);
  if (!id || id <= 0n) return NextResponse.json({ error: "Proceso inválido" }, { status: 400 });
  const actualizado = await db.despachoProceso.updateMany({ where: { id }, data: { activo: false } });
  return actualizado.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Proceso no encontrado" }, { status: 404 });
});
