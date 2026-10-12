"use client";

// Ventas, Compras, Precios y Reportes de retail: componentes reales con las props de sus page.tsx, desde el almacén.
import { ComprasCliente } from "@/components/retail/ComprasCliente";
import { PreciosCliente } from "@/components/retail/PreciosCliente";
import { ReportesRetailCliente } from "@/components/retail/ReportesRetailCliente";
import { VentasCliente } from "@/components/retail/VentasCliente";
import { useDatos } from "@/lib/demo/usar-almacen";
import { compraVista, ventaVista } from "@/lib/demo/vistas";

const productosActivos = (d: ReturnType<typeof useDatos>) =>
  (d.extra.productos ?? []).filter((p) => p.activo).sort((a, b) => a.nombre.localeCompare(b.nombre)).map((p) => ({ ...p, movimientos: undefined }));

export function PantallaVentas() {
  const d = useDatos();
  return (
    <VentasCliente
      ventas={(d.extra.ventas ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100).map((v) => ventaVista(d, v))}
      productos={productosActivos(d)}
      contactos={d.contactos.slice().sort((a, b) => a.nombre.localeCompare(b.nombre)).map((c) => ({ id: c.id, nombre: c.nombre, telefono: c.telefono }))}
    />
  );
}

export function PantallaCompras() {
  const d = useDatos();
  return (
    <ComprasCliente
      compras={(d.extra.compras ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((c) => compraVista(d, c))}
      productos={productosActivos(d)}
      proveedores={(d.extra.proveedores ?? []).slice().sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre))}
    />
  );
}

export function PantallaPrecios() {
  const d = useDatos();
  const nombreProducto = (id: string | null) => (id ? { nombre: (d.extra.productos ?? []).find((p) => p.id === id)?.nombre ?? "—" } : null);
  return (
    <PreciosCliente
      datos={{
        productos: productosActivos(d).map((p) => ({ id: p.id, nombre: p.nombre, sku: p.sku })),
        contactos: d.contactos.map((c) => ({ id: c.id, nombre: c.nombre, listaPrecioId: (c.campos as any).listaPrecioId ?? null })),
        listas: d.extra.listasPrecio ?? [],
        escalas: (d.extra.escalas ?? []).map((e) => ({ id: e.id, desde: String(e.desde), precio: String(e.precio), producto: nombreProducto(e.productoId)! })),
        promociones: (d.extra.promociones ?? []).map((p) => ({ id: p.id, nombre: p.nombre, tipo: p.tipo, inicia: p.inicia, termina: p.termina, producto: nombreProducto(p.productoId), categoria: p.categoria })),
      }}
    />
  );
}

export function PantallaReportesRetail() {
  return <ReportesRetailCliente />;
}
