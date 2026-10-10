import { createHash } from "node:crypto";
import { descuentoMaximoCajero, ventasSinRedActivas } from "@/lib/caja";
import { zonaEmpresa } from "@/lib/precios-db";
import { transaccionTenant } from "@/lib/retail-db";
import type { CatalogoCaja, ProductoCatalogoCaja, PromocionCatalogoCaja } from "@/lib/caja-offline/tipos";

export type { CatalogoCaja } from "@/lib/caja-offline/tipos";

/** Catálogo para la caja sin internet: precios base, escalas y promociones; el precio final lo calcula `calcularLineaPura`. */
export async function construirCatalogoCaja(orgId: bigint): Promise<CatalogoCaja> {
  const datos = await transaccionTenant(orgId, async (tx) => {
    const lista = await tx.listaPrecio.findFirst({ where: { tipo: "publico", activa: true }, orderBy: { id: "asc" }, select: { id: true } });
    const [productos, escalas, preciosLista, promociones, zona, modulo] = await Promise.all([
      tx.producto.findMany({ where: { activo: true }, orderBy: { id: "asc" } }),
      tx.precioVolumen.findMany({ orderBy: [{ productoId: "asc" }, { desde: "desc" }] }),
      lista ? tx.listaPrecioProducto.findMany({ where: { listaId: lista.id } }) : [],
      tx.promocion.findMany({ where: { activa: true }, orderBy: { id: "asc" } }),
      zonaEmpresa(tx),
      tx.moduloOrg.findFirst({ where: { clave: "caja", activo: true }, select: { config: true } }),
    ]);
    return { productos, escalas, preciosLista, promociones, zona, config: modulo?.config ?? null };
  });
  const precioLista = new Map(datos.preciosLista.map((item) => [String(item.productoId), item.precio.toString()]));
  const escalasPorProducto = new Map<string, Array<{ desde: string; precio: string }>>();
  for (const escala of datos.escalas) {
    const clave = String(escala.productoId);
    escalasPorProducto.set(clave, [...(escalasPorProducto.get(clave) ?? []), { desde: escala.desde.toString(), precio: escala.precio.toString() }]);
  }
  const cuerpo = {
    zona: datos.zona,
    descuentoMaximo: descuentoMaximoCajero(datos.config),
    ventasSinRed: ventasSinRedActivas(datos.config),
    productos: datos.productos.map((producto): ProductoCatalogoCaja => ({
      id: String(producto.id),
      nombre: producto.nombre,
      sku: producto.sku,
      codigoBarras: producto.codigoBarras,
      categoria: producto.categoria,
      unidad: producto.unidad,
      vendePorPeso: producto.vendePorPeso,
      stock: producto.stock.toString(),
      precio: producto.precio.toString(),
      precioLista: precioLista.get(String(producto.id)) ?? null,
      escalas: escalasPorProducto.get(String(producto.id)) ?? [],
    })),
    promociones: datos.promociones.map((promo): PromocionCatalogoCaja => ({
      id: String(promo.id),
      productoId: promo.productoId === null ? null : String(promo.productoId),
      categoria: promo.categoria,
      tipo: promo.tipo,
      nombre: promo.nombre,
      valor: promo.valor?.toString() ?? null,
      cantidadCompra: promo.cantidadCompra,
      cantidadPaga: promo.cantidadPaga,
      inicia: promo.inicia.toISOString().slice(0, 10),
      termina: promo.termina.toISOString().slice(0, 10),
    })),
  };
  const version = createHash("sha1").update(JSON.stringify(cuerpo)).digest("hex").slice(0, 12);
  return { version, generadoAt: new Date().toISOString(), ...cuerpo };
}
