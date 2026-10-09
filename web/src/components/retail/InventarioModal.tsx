"use client";

import { useEffect, useState } from "react";
import { Boton, Campo, Modal } from "@/components/ui";
import type { ProductoRetail } from "@/components/retail/tipos";
import { formatearCantidad } from "@/lib/retail-calculos";

export function InventarioModal({
  producto,
  guardando,
  onClose,
  onGuardar,
}: {
  producto: ProductoRetail | null;
  guardando: boolean;
  onClose: () => void;
  onGuardar: (datos: { tipo: string; cantidad: string; motivo: string }) => Promise<void>;
}) {
  const [tipo, setTipo] = useState("entrada");
  const [cantidad, setCantidad] = useState("1");
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (!producto) return;
    setTipo("entrada");
    setCantidad("1");
    setMotivo("");
  }, [producto]);

  return (
    <Modal abierto={Boolean(producto)} onClose={onClose} titulo="Movimiento de inventario">
      <form
        onSubmit={(evento) => {
          evento.preventDefault();
          void onGuardar({ tipo, cantidad, motivo });
        }}
        className="space-y-4"
      >
        <div className="rounded-lg bg-muted p-3 text-sm">
          <p className="font-semibold">{producto?.nombre}</p>
          <p className="text-muted-foreground">
            Existencia actual: {producto ? formatearCantidad(producto.stock, producto.unidad) : "0"}
          </p>
        </div>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted-foreground">Movimiento</span>
          <select
            value={tipo}
            onChange={(evento) => setTipo(evento.target.value)}
            className="w-full rounded-lg border border-input px-3 py-2 text-sm"
          >
            <option value="entrada">Entrada de mercancía</option>
            <option value="salida">Salida o merma</option>
          </select>
        </label>
        <Campo
          label="Cantidad"
          type="number"
          min={producto?.vendePorPeso ? "0.001" : "1"}
          step={producto?.vendePorPeso ? "0.001" : "1"}
          value={cantidad}
          onChange={(evento) => setCantidad(evento.target.value)}
          required
        />
        <Campo
          label="Motivo"
          value={motivo}
          onChange={(evento) => setMotivo(evento.target.value)}
          placeholder="Compra a proveedor, merma, corrección…"
          required
        />
        <div className="flex justify-end gap-2">
          <Boton type="button" variante="ghost" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton type="submit" disabled={guardando}>
            {guardando ? "Aplicando…" : "Aplicar movimiento"}
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
