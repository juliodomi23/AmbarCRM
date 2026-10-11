"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/Toaster";

type Producto = { id: string; nombre: string; precio: string; unidad: string; visibleEnLinea: boolean; agotadoManual: boolean; etiquetasEnLinea: string[] };

export function GestionCatalogo({ productos, esAdmin }: { productos: Producto[]; esAdmin: boolean }) {
  const router = useRouter();
  const [filas, setFilas] = useState(productos.map((p) => ({ ...p, etiquetasEnLinea: p.etiquetasEnLinea.join(", ") })));
  const [guardando, setGuardando] = useState(false);
  async function guardar() {
    setGuardando(true);
    const respuesta = await fetch("/api/pedidos-en-linea/productos", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ productos: filas }) });
    setGuardando(false);
    if (respuesta.ok) router.refresh(); else toast((await respuesta.json()).error ?? "No se pudo guardar", "error");
  }
  return <section className="surface p-4"><div className="mb-3 flex items-center justify-between"><div><h2 className="font-semibold">Catálogo y precios</h2><p className="text-xs text-muted-foreground">Publica productos, cambia varios precios o marca agotados sin alterar la existencia.</p></div>{esAdmin && <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" disabled={guardando} onClick={guardar}>{guardando ? "Guardando…" : "Guardar cambios"}</button>}</div>
    <div className="overflow-x-auto"><table className="tabla"><thead><tr><th className="p-2">Producto</th><th>Precio</th><th>Visible</th><th>Agotado</th><th>Etiquetas</th></tr></thead><tbody>{filas.map((fila, indice) => <tr key={fila.id}><td className="p-2 font-medium">{fila.nombre}<small className="block text-muted-foreground">por {fila.unidad}</small></td><td><input className="w-28 rounded-lg border border-input bg-card p-2 text-sm" disabled={!esAdmin} value={fila.precio} onChange={(e) => setFilas(filas.map((f, i) => i === indice ? { ...f, precio: e.target.value } : f))} /></td><td><input type="checkbox" disabled={!esAdmin} checked={fila.visibleEnLinea} onChange={(e) => setFilas(filas.map((f, i) => i === indice ? { ...f, visibleEnLinea: e.target.checked } : f))} /></td><td><input type="checkbox" disabled={!esAdmin} checked={fila.agotadoManual} onChange={(e) => setFilas(filas.map((f, i) => i === indice ? { ...f, agotadoManual: e.target.checked } : f))} /></td><td><input className="min-w-52 rounded border p-2" disabled={!esAdmin} value={fila.etiquetasEnLinea} onChange={(e) => setFilas(filas.map((f, i) => i === indice ? { ...f, etiquetasEnLinea: e.target.value } : f))} /></td></tr>)}</tbody></table></div>
  </section>;
}
