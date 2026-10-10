import { LIMITE_PANEL } from "@/lib/paginacion";
import { transaccionTenant } from "@/lib/retail-db";

/** Lo que el Encargado revisa de las ventas sin internet: marcas, rechazos y existencias negativas. */
export async function panelRevisionSinRed(orgId: bigint) {
  return transaccionTenant(orgId, async (tx) => {
    const [ventas, rechazos, negativos] = await Promise.all([
      tx.venta.findMany({
        where: { sinRed: true, revisionResueltaAt: null, revisionMotivos: { isEmpty: false } },
        include: { creadoPor: { select: { id: true, nombre: true } }, caja: { select: { id: true, nombre: true } } },
        orderBy: { vendidaAt: "desc" },
        take: LIMITE_PANEL,
      }),
      tx.colaCajaRechazo.findMany({ where: { resueltaAt: null }, orderBy: { createdAt: "desc" }, take: LIMITE_PANEL }),
      tx.producto.findMany({
        where: { stock: { lt: 0 } },
        select: { id: true, nombre: true, sku: true, stock: true, unidad: true },
        orderBy: { stock: "asc" },
        take: LIMITE_PANEL,
      }),
    ]);
    const usuarios = new Map(
      (await tx.usuario.findMany({
        where: { id: { in: [...new Set(rechazos.flatMap((r) => (r.usuarioId === null ? [] : [r.usuarioId])))] } },
        select: { id: true, nombre: true },
      })).map((usuario) => [String(usuario.id), usuario.nombre]),
    );
    const porCajero = new Map<string, { cajero: { id: bigint; nombre: string } | null; ventas: number; diferencia: number }>();
    for (const venta of ventas) {
      if (venta.diferenciaPrecio === null) continue;
      const clave = String(venta.creadoPorId ?? "sin-cajero");
      const fila = porCajero.get(clave) ?? { cajero: venta.creadoPor, ventas: 0, diferencia: 0 };
      fila.ventas++;
      fila.diferencia += Number(venta.diferenciaPrecio);
      porCajero.set(clave, fila);
    }
    return {
      ventas: ventas.map((venta) => ({
        id: venta.id, folio: venta.folio, total: venta.total, vendidaAt: venta.vendidaAt, subidaAt: venta.subidaAt,
        motivos: venta.revisionMotivos, diferenciaPrecio: venta.diferenciaPrecio, cajero: venta.creadoPor,
        caja: venta.caja, turnoId: venta.turnoId, turnoOriginalId: venta.turnoOriginalId,
      })),
      diferenciasPorCajero: [...porCajero.values()].map((fila) => ({ ...fila, diferencia: fila.diferencia.toFixed(2) })),
      rechazos: rechazos.map((rechazo) => {
        const payload = rechazo.payload as { folio?: string; totalCobrado?: string } | null;
        return {
          id: rechazo.id, uuidCliente: rechazo.uuidCliente, folio: payload?.folio ?? null, total: payload?.totalCobrado ?? null,
          motivo: rechazo.motivo, codigo: rechazo.codigo, vendidaAt: rechazo.vendidaAt, createdAt: rechazo.createdAt,
          cajero: rechazo.usuarioId === null ? null : usuarios.get(String(rechazo.usuarioId)) ?? null,
        };
      }),
      inventarioNegativo: negativos,
    };
  });
}

export async function resolverRevisionVenta(orgId: bigint, ventaId: bigint, usuarioId: bigint) {
  return transaccionTenant(orgId, async (tx) => {
    const resultado = await tx.venta.updateMany({
      where: { id: ventaId, sinRed: true, revisionResueltaAt: null },
      data: { revisionResueltaAt: new Date(), revisionResueltaPor: usuarioId },
    });
    return resultado.count === 1;
  });
}

export async function resolverRechazo(orgId: bigint, rechazoId: bigint, usuarioId: bigint) {
  return transaccionTenant(orgId, async (tx) => {
    const resultado = await tx.colaCajaRechazo.updateMany({
      where: { id: rechazoId, resueltaAt: null },
      data: { resueltaAt: new Date(), resueltaPor: usuarioId },
    });
    return resultado.count === 1;
  });
}
