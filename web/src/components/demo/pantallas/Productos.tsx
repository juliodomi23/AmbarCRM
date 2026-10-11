"use client";

// Productos: ProductosCliente real con las props de app/(app)/productos/page.tsx, desde el almacén.
import { ProductosCliente } from "@/components/retail/ProductosCliente";
import { useDatos } from "@/lib/demo/usar-almacen";

export function PantallaProductos() {
  const d = useDatos();
  const productos = (d.extra.productos ?? []).slice().sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre));
  return <ProductosCliente productos={productos.map((p) => ({ ...p, movimientos: p.movimientos.slice(0, 1) }))} />;
}
