"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProductoRetail, ProveedorRetail } from "@/components/retail/tipos";
import { Boton, Campo, Modal, formatoMoneda } from "@/components/ui";
import { numeroMoneda, totalPartidaCentavos } from "@/lib/retail-calculos";

type PartidaCompraForm = {
  productoId: string;
  cantidad: string;
  costoUnitario: string;
};

export type CompraFormulario = {
  proveedorId: string;
  estado: string;
  notas: string;
  partidas: PartidaCompraForm[];
};

export function CompraFormModal({
  abierto,
  productos,
  proveedores,
  guardando,
  onClose,
  onGuardar,
}: {
  abierto: boolean;
  productos: ProductoRetail[];
  proveedores: ProveedorRetail[];
  guardando: boolean;
  onClose: () => void;
  onGuardar: (formulario: CompraFormulario) => Promise<void>;
}) {
  const disponibles = useMemo(
    () => productos.filter((producto) => producto.activo),
    [productos],
  );
  const activos = useMemo(
    () => proveedores.filter((proveedor) => proveedor.activo),
    [proveedores],
  );
  const [formulario, setFormulario] = useState<CompraFormulario>({
    proveedorId: "",
    estado: "ordenada",
    notas: "",
    partidas: [{ productoId: "", cantidad: "1", costoUnitario: "0" }],
  });

  useEffect(() => {
    if (!abierto) return;
    const producto = disponibles[0];
    setFormulario({
      proveedorId: activos[0]?.id ?? "",
      estado: "ordenada",
      notas: "",
      partidas: [
        {
          productoId: producto?.id ?? "",
          cantidad: "1",
          costoUnitario: String(producto?.costo ?? 0),
        },
      ],
    });
  }, [abierto, activos, disponibles]);

  const total = useMemo(
    () =>
      formulario.partidas.reduce(
        (suma, partida) =>
          suma + totalPartidaCentavos(partida.costoUnitario || 0, partida.cantidad || 0),
        0n,
      ),
    [formulario.partidas],
  );

  function set(campo: "proveedorId" | "estado" | "notas", valor: string) {
    setFormulario((actual) => ({ ...actual, [campo]: valor }));
  }

  function setPartida(indice: number, campo: keyof PartidaCompraForm, valor: string) {
    setFormulario((actual) => ({
      ...actual,
      partidas: actual.partidas.map((partida, posicion) => {
        if (posicion !== indice) return partida;
        if (campo !== "productoId") return { ...partida, [campo]: valor };
        const producto = productos.find((item) => item.id === valor);
        return {
          ...partida,
          productoId: valor,
          costoUnitario: String(producto?.costo ?? 0),
        };
      }),
    }));
  }

  function agregarPartida() {
    const producto = disponibles[0];
    setFormulario((actual) => ({
      ...actual,
      partidas: [
        ...actual.partidas,
        {
          productoId: producto?.id ?? "",
          cantidad: "1",
          costoUnitario: String(producto?.costo ?? 0),
        },
      ],
    }));
  }

  function quitarPartida(indice: number) {
    setFormulario((actual) => ({
      ...actual,
      partidas: actual.partidas.filter((_, posicion) => posicion !== indice),
    }));
  }

  return (
    <Modal abierto={abierto} onClose={onClose} titulo="Nueva orden de compra">
      <form
        onSubmit={(evento) => {
          evento.preventDefault();
          void onGuardar(formulario);
        }}
        className="max-h-[76vh] space-y-4 overflow-y-auto pr-1"
      >
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted-foreground">Proveedor</span>
          <select
            value={formulario.proveedorId}
            onChange={(evento) => set("proveedorId", evento.target.value)}
            className="w-full rounded-lg border border-input px-3 py-2 text-sm"
            required
          >
            <option value="">Selecciona un proveedor</option>
            {activos.map((proveedor) => (
              <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>
            ))}
          </select>
        </label>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Productos</span>
            <button type="button" onClick={agregarPartida} className="text-xs text-primary">
              + Agregar partida
            </button>
          </div>
          {formulario.partidas.map((partida, indice) => (
            <div key={indice} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex gap-2">
                <select
                  value={partida.productoId}
                  onChange={(evento) => setPartida(indice, "productoId", evento.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-input px-2 py-2 text-sm"
                  required
                >
                  <option value="">Selecciona un producto</option>
                  {disponibles.map((producto) => (
                    <option key={producto.id} value={producto.id}>{producto.nombre}</option>
                  ))}
                </select>
                {formulario.partidas.length > 1 && (
                  <button
                    type="button"
                    onClick={() => quitarPartida(indice)}
                    className="px-1 text-destructive"
                    aria-label="Quitar partida"
                  >
                    ✕
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Campo
                  label="Cantidad"
                  type="number"
                  min={productos.find((producto) => producto.id === partida.productoId)?.vendePorPeso ? "0.001" : "1"}
                  step={productos.find((producto) => producto.id === partida.productoId)?.vendePorPeso ? "0.001" : "1"}
                  value={partida.cantidad}
                  onChange={(evento) => setPartida(indice, "cantidad", evento.target.value)}
                  required
                />
                <Campo
                  label="Costo unitario"
                  type="number"
                  min="0"
                  step="0.01"
                  value={partida.costoUnitario}
                  onChange={(evento) => setPartida(indice, "costoUnitario", evento.target.value)}
                  required
                />
              </div>
            </div>
          ))}
        </div>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted-foreground">Estado inicial</span>
          <select
            value={formulario.estado}
            onChange={(evento) => set("estado", evento.target.value)}
            className="w-full rounded-lg border border-input px-3 py-2 text-sm"
          >
            <option value="ordenada">Ordenada, pendiente de recibir</option>
            <option value="recibida">Recibida, sumar al inventario</option>
            <option value="borrador">Borrador</option>
          </select>
        </label>
        <Campo
          label="Notas"
          value={formulario.notas}
          onChange={(evento) => set("notas", evento.target.value)}
        />
        <div className="flex justify-between rounded-lg bg-muted p-3 font-bold">
          <span>Total de compra</span>
          <span>{formatoMoneda(numeroMoneda(total))}</span>
        </div>
        <div className="flex justify-end gap-2">
          <Boton type="button" variante="ghost" onClick={onClose}>Cancelar</Boton>
          <Boton
            type="submit"
            disabled={guardando || disponibles.length === 0 || activos.length === 0}
          >
            {guardando ? "Guardando…" : "Crear orden"}
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
