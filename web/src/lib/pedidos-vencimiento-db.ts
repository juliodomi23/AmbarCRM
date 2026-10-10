import { configPedidos } from "@/lib/pedidos";
import { bloquearVenta, transaccionTenant } from "@/lib/retail-db";

/** Cancela vencidos; cada candidato se revalida después de bloquear la venta. */
export async function vencerPedidos(orgId: bigint, ahora = new Date()) {
  const candidatos = await transaccionTenant(orgId, async (tx) => {
    const modulo = await tx.moduloOrg.findFirst({
      where: { clave: "pedidos_en_linea", activo: true },
      select: { config: true },
    });
    if (!modulo) return [];
    const limite = new Date(ahora.getTime() - configPedidos(modulo.config).horasVencimiento * 60 * 60_000);
    return tx.venta.findMany({
      where: { canal: "tienda_en_linea", estado: "pendiente", stockAplicado: false, createdAt: { lt: limite } },
      select: { id: true },
      orderBy: { id: "asc" },
    });
  });

  let vencidos = 0;
  for (const candidato of candidatos) {
    const vencio = await transaccionTenant(orgId, async (tx) => {
      await bloquearVenta(tx, candidato.id);
      const venta = await tx.venta.findUnique({
        where: { id: candidato.id },
        select: { canal: true, estado: true, stockAplicado: true },
      });
      if (!venta || venta.canal !== "tienda_en_linea" || venta.estado !== "pendiente" || venta.stockAplicado) return false;
      await tx.reservaPedido.updateMany({ where: { ventaId: candidato.id, activa: true }, data: { activa: false } });
      await tx.venta.update({ where: { id: candidato.id }, data: { estado: "cancelada" } });
      return true;
    });
    if (vencio) vencidos++;
  }
  return vencidos;
}
