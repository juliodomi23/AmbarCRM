import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { conModulo } from "@/lib/con-modulo";
import { transaccionTenant } from "@/lib/retail-db";
import { aBigInt } from "@/lib/ids";
import { exigirGestion, mesValido, texto, aFecha } from "@/lib/despacho-api";
import { fechaLimiteDe, periodosDelMes, type Periodicidad } from "@/lib/despacho";

export const POST = conModulo("despacho", {}, async (sesion, req: NextRequest) => {
  const bloqueo = exigirGestion(sesion);
  if (bloqueo) return bloqueo;
  const body = await req.json().catch(() => null);
  const mes = mesValido(body?.mes);
  if (!mes) return NextResponse.json({ error: "Elige un mes válido (YYYY-MM)" }, { status: 400 });
  const procesoIds = Array.isArray(body?.procesoIds)
    ? (body.procesoIds as unknown[]).map((valor) => aBigInt(texto(valor))).filter((valor): valor is bigint => valor !== null)
    : [];
  const resultado = await transaccionTenant(sesion.orgId!, async (tx) => {
    const clientes = await tx.despachoCliente.findMany({
      where: { activo: true },
      include: {
        procesos: {
          where: { activo: true, ...(procesoIds.length ? { procesoId: { in: procesoIds } } : {}) },
          include: {
            proceso: {
              include: { actividades: { where: { activo: true }, orderBy: [{ orden: "asc" }, { id: "asc" }] } },
            },
          },
        },
      },
    });
    const datos: Prisma.DespachoActividadCreateManyInput[] = [];
    for (const cliente of clientes) {
      for (const asignacion of cliente.procesos) {
        if (!asignacion.proceso.activo) continue;
        const periodicidad = asignacion.proceso.periodicidad as Periodicidad;
        const periodos = periodosDelMes(mes, periodicidad);
        for (const plantilla of asignacion.proceso.actividades) {
          for (const periodo of periodos) {
            datos.push({
              clienteId: cliente.id,
              clienteProcesoId: asignacion.id,
              plantillaActividadId: plantilla.id,
              tipo: "fija",
              titulo: plantilla.nombre,
              periodo: aFecha(periodo),
              fechaLimite: aFecha(fechaLimiteDe(periodo, plantilla.diaLimite, periodicidad)),
              peso: plantilla.peso,
              responsableId: asignacion.responsableId ?? cliente.responsableId,
            });
          }
        }
      }
    }
    const creadas = datos.length
      ? await tx.despachoActividad.createMany({ data: datos, skipDuplicates: true })
      : { count: 0 };
    return { creadas: creadas.count, existentes: datos.length - creadas.count, total: datos.length };
  });
  revalidatePath("/despacho", "page");
  revalidatePath("/despacho/tablero", "page");
  revalidatePath("/despacho/mi-trabajo", "page");
  return NextResponse.json({ ...resultado, mes });
});
