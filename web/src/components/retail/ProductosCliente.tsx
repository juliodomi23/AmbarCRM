"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { InventarioModal } from "@/components/retail/InventarioModal";
import {
  ProductoFormModal,
  type ProductoFormulario,
} from "@/components/retail/ProductoFormModal";
import type { ProductoRetail } from "@/components/retail/tipos";
import { toast } from "@/components/Toaster";
import { Boton, formatoMoneda } from "@/components/ui";
import {
  centavos,
  compararCantidades,
  formatearCantidad,
  formatearMilesimas,
  milesimas,
  numeroMoneda,
  totalPartidaCentavos,
} from "@/lib/retail-calculos";

function errorApi(payload: unknown) {
  if (payload && typeof payload === "object" && "error" in payload) {
    return String(payload.error);
  }
  return "No se pudo completar la operación";
}

export function ProductosCliente({ productos }: { productos: ProductoRetail[] }) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("activos");
  const [modalProducto, setModalProducto] = useState(false);
  const [productoEditado, setProductoEditado] = useState<ProductoRetail | null>(null);
  const [productoMovimiento, setProductoMovimiento] = useState<ProductoRetail | null>(null);
  const [guardando, setGuardando] = useState(false);

  const filtrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    return productos.filter((producto) => {
      if (filtro === "activos" && !producto.activo) return false;
      if (filtro === "bajo" && (!producto.activo || compararCantidades(producto.stock, producto.stockMinimo) > 0)) {
        return false;
      }
      if (filtro === "agotado" && (!producto.activo || compararCantidades(producto.stock, 0) !== 0)) return false;
      if (!termino) return true;
      return [producto.nombre, producto.sku, producto.codigoBarras, producto.categoria]
        .filter(Boolean)
        .some((valor) => valor!.toLowerCase().includes(termino));
    });
  }, [busqueda, filtro, productos]);

  const activos = productos.filter((producto) => producto.activo);
  const bajoStock = activos.filter((producto) => compararCantidades(producto.stock, producto.stockMinimo) <= 0).length;
  const unidades = activos.reduce((total, producto) => total + (milesimas(producto.stock) ?? 0n), 0n);
  const valorCosto = activos.reduce(
    (total, producto) => total + totalPartidaCentavos(producto.costo, producto.stock),
    0n,
  );

  function abrirNuevo() {
    setProductoEditado(null);
    setModalProducto(true);
  }

  function abrirEditar(producto: ProductoRetail) {
    setProductoEditado(producto);
    setModalProducto(true);
  }

  async function guardarProducto(formulario: ProductoFormulario) {
    setGuardando(true);
    const url = productoEditado ? `/api/productos/${productoEditado.id}` : "/api/productos";
    const respuesta = await fetch(url, {
      method: productoEditado ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formulario),
    });
    const payload = await respuesta.json().catch(() => null);
    setGuardando(false);
    if (!respuesta.ok) {
      toast(errorApi(payload), "error");
      return;
    }
    setModalProducto(false);
    setProductoEditado(null);
    toast(productoEditado ? "Producto actualizado" : "Producto agregado");
    router.refresh();
  }

  async function guardarMovimiento(datos: { tipo: string; cantidad: string; motivo: string }) {
    if (!productoMovimiento) return;
    setGuardando(true);
    const respuesta = await fetch(`/api/productos/${productoMovimiento.id}/movimientos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
    const payload = await respuesta.json().catch(() => null);
    setGuardando(false);
    if (!respuesta.ok) {
      toast(errorApi(payload), "error");
      return;
    }
    setProductoMovimiento(null);
    toast("Inventario actualizado");
    router.refresh();
  }

  async function cambiarTienda(producto: ProductoRetail, cambio: Partial<Pick<ProductoRetail, "visibleEnLinea" | "agotadoManual">>) {
    setGuardando(true);
    const respuesta = await fetch("/api/pedidos-en-linea/productos", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productos: [{ id: producto.id, precio: producto.precio, visibleEnLinea: producto.visibleEnLinea, agotadoManual: producto.agotadoManual, etiquetasEnLinea: producto.etiquetasEnLinea, ...cambio }] }),
    });
    setGuardando(false);
    if (!respuesta.ok) return toast(errorApi(await respuesta.json().catch(() => null)), "error");
    toast("Catálogo en línea actualizado"); router.refresh();
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Productos e inventario</h1>
          <p className="text-sm text-muted-foreground">
            Catálogo, existencias y trazabilidad de movimientos.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/compras" className="rounded-lg bg-muted px-3.5 py-2 text-sm font-medium">
            Compras
          </Link>
          <Link href="/ventas" className="rounded-lg bg-muted px-3.5 py-2 text-sm font-medium">
            Ver ventas
          </Link>
          <Boton onClick={abrirNuevo}>+ Producto</Boton>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi etiqueta="Productos activos" valor={String(activos.length)} />
        <Kpi etiqueta="Existencia acumulada" valor={formatearMilesimas(unidades)} />
        <Kpi etiqueta="Stock bajo o agotado" valor={String(bajoStock)} alerta={bajoStock > 0} />
        <Kpi etiqueta="Valor a costo" valor={formatoMoneda(numeroMoneda(valorCosto))} />
      </section>

      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          placeholder="Buscar producto, SKU, código o categoría…"
          className="min-w-64 flex-1 rounded-lg border border-input bg-card px-3 py-2 text-sm"
        />
        <select
          value={filtro}
          onChange={(evento) => setFiltro(evento.target.value)}
          className="rounded-lg border border-input bg-card px-3 py-2 text-sm"
        >
          <option value="activos">Productos activos</option>
          <option value="bajo">Stock bajo</option>
          <option value="agotado">Agotados</option>
          <option value="todos">Todos</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[850px] text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3">Categoría</th>
              <th className="px-4 py-3 text-right">Precio</th>
              <th className="px-4 py-3 text-right">Existencia</th>
              <th className="px-4 py-3">Último movimiento</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((producto) => {
              const bajo = producto.activo && compararCantidades(producto.stock, producto.stockMinimo) <= 0;
              const ultimo = producto.movimientos?.[0];
              return (
                <tr key={producto.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <ProductoFoto producto={producto} />
                      <div>
                        <p className="font-semibold">{producto.nombre}</p>
                        <p className="text-xs text-muted-foreground">
                          {producto.sku ?? "Sin SKU"}
                          {!producto.activo ? " · Inactivo" : ""}
                          {producto.visibleEnLinea ? " · En tienda" : ""}
                          {producto.agotadoManual ? " · Agotado en línea" : ""}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {producto.categoria ?? "Sin categoría"}
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatoMoneda(numeroMoneda(centavos(producto.precio) ?? 0n), producto.moneda)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={[
                        "inline-flex rounded-full px-2 py-1 font-semibold",
                        bajo ? "bg-warning/15 text-warning" : "bg-success/15 text-success",
                      ].join(" ")}
                    >
                      {formatearCantidad(producto.stock, producto.unidad)}
                    </span>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      mínimo {formatearCantidad(producto.stockMinimo, producto.unidad)}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {ultimo ? (
                      <>
                        <p>
                          {compararCantidades(ultimo.cantidad, 0) > 0 ? "+" : ""}
                          {formatearCantidad(ultimo.cantidad, producto.unidad)} · {ultimo.motivo}
                        </p>
                        <p>{new Date(ultimo.createdAt).toLocaleDateString("es-MX")}</p>
                      </>
                    ) : (
                      "Sin movimientos"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Boton variante="ghost" onClick={() => abrirEditar(producto)}>
                        Editar
                      </Boton>
                      <Boton variante="ghost" onClick={() => cambiarTienda(producto, { visibleEnLinea: !producto.visibleEnLinea })}>
                        {producto.visibleEnLinea ? "Ocultar tienda" : "Publicar tienda"}
                      </Boton>
                      {producto.visibleEnLinea && <Boton variante="ghost" onClick={() => cambiarTienda(producto, { agotadoManual: !producto.agotadoManual })}>
                        {producto.agotadoManual ? "Reactivar" : "Marcar agotado"}
                      </Boton>}
                      <Boton onClick={() => setProductoMovimiento(producto)}>Inventario</Boton>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtrados.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No hay productos con esos filtros.
          </div>
        )}
      </div>

      <ProductoFormModal
        abierto={modalProducto}
        producto={productoEditado}
        guardando={guardando}
        onClose={() => setModalProducto(false)}
        onGuardar={guardarProducto}
      />
      <InventarioModal
        producto={productoMovimiento}
        guardando={guardando}
        onClose={() => setProductoMovimiento(null)}
        onGuardar={guardarMovimiento}
      />
    </div>
  );
}

function ProductoFoto({ producto }: { producto: ProductoRetail }) {
  if (!producto.fotoUrl) {
    return <div className="grid h-10 w-10 place-items-center rounded-lg bg-muted text-lg">📦</div>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={producto.fotoUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
  );
}

function Kpi({ etiqueta, valor, alerta = false }: { etiqueta: string; valor: string; alerta?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <p className="text-xs uppercase text-muted-foreground">{etiqueta}</p>
      <p className={`mt-1 text-2xl font-bold ${alerta ? "text-warning" : ""}`}>{valor}</p>
    </div>
  );
}
