"use client";

import { useEffect, useState } from "react";
import { Boton, Campo, Modal } from "@/components/ui";
import type { ProductoRetail } from "@/components/retail/tipos";

const INICIAL = {
  nombre: "",
  sku: "",
  codigoBarras: "",
  categoria: "",
  descripcion: "",
  precio: "",
  costo: "",
  stock: "0",
  stockMinimo: "0",
  fotoUrl: "",
  activo: true,
};

export type ProductoFormulario = typeof INICIAL;

export function ProductoFormModal({
  abierto,
  producto,
  guardando,
  onClose,
  onGuardar,
}: {
  abierto: boolean;
  producto: ProductoRetail | null;
  guardando: boolean;
  onClose: () => void;
  onGuardar: (formulario: ProductoFormulario) => Promise<void>;
}) {
  const [formulario, setFormulario] = useState(INICIAL);

  useEffect(() => {
    if (!abierto) return;
    setFormulario(
      producto
        ? {
            nombre: producto.nombre,
            sku: producto.sku ?? "",
            codigoBarras: producto.codigoBarras ?? "",
            categoria: producto.categoria ?? "",
            descripcion: producto.descripcion ?? "",
            precio: String(producto.precio),
            costo: String(producto.costo),
            stock: String(producto.stock),
            stockMinimo: String(producto.stockMinimo),
            fotoUrl: producto.fotoUrl ?? "",
            activo: producto.activo,
          }
        : INICIAL,
    );
  }, [abierto, producto]);

  function set(campo: keyof ProductoFormulario, valor: string | boolean) {
    setFormulario((actual) => ({ ...actual, [campo]: valor }));
  }

  return (
    <Modal
      abierto={abierto}
      onClose={onClose}
      titulo={producto ? "Editar producto" : "Agregar producto"}
    >
      <form
        onSubmit={(evento) => {
          evento.preventDefault();
          void onGuardar(formulario);
        }}
        className="max-h-[75vh] space-y-3 overflow-y-auto pr-1"
      >
        <Campo
          label="Nombre"
          value={formulario.nombre}
          onChange={(evento) => set("nombre", evento.target.value)}
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <Campo
            label="SKU"
            value={formulario.sku}
            onChange={(evento) => set("sku", evento.target.value)}
          />
          <Campo
            label="Código de barras"
            value={formulario.codigoBarras}
            onChange={(evento) => set("codigoBarras", evento.target.value)}
          />
          <Campo
            label="Categoría"
            value={formulario.categoria}
            onChange={(evento) => set("categoria", evento.target.value)}
          />
          <Campo
            label="Precio de venta"
            type="number"
            min="0"
            step="0.01"
            value={formulario.precio}
            onChange={(evento) => set("precio", evento.target.value)}
            required
          />
          <Campo
            label="Costo"
            type="number"
            min="0"
            step="0.01"
            value={formulario.costo}
            onChange={(evento) => set("costo", evento.target.value)}
          />
          <Campo
            label="Stock mínimo"
            type="number"
            min="0"
            value={formulario.stockMinimo}
            onChange={(evento) => set("stockMinimo", evento.target.value)}
          />
          {!producto && (
            <Campo
              label="Existencia inicial"
              type="number"
              min="0"
              value={formulario.stock}
              onChange={(evento) => set("stock", evento.target.value)}
            />
          )}
        </div>
        <Campo
          label="URL de fotografía"
          type="url"
          value={formulario.fotoUrl}
          onChange={(evento) => set("fotoUrl", evento.target.value)}
        />
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted-foreground">Descripción</span>
          <textarea
            rows={2}
            value={formulario.descripcion}
            onChange={(evento) => set("descripcion", evento.target.value)}
            className="w-full rounded-lg border border-input px-3 py-2 text-sm"
          />
        </label>
        {producto && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={formulario.activo}
              onChange={(evento) => set("activo", evento.target.checked)}
            />
            Producto activo para nuevas ventas
          </label>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Boton type="button" variante="ghost" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton type="submit" disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar producto"}
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
