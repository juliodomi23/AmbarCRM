"use client";

import { useEffect, useMemo, useState } from "react";
import type { ContactoVenta, ProductoRetail } from "@/components/retail/tipos";
import { Boton, Campo, Modal, formatoMoneda } from "@/components/ui";
import {
  centavos,
  formatearCantidad,
  numeroMoneda,
  totalPartidaCentavos,
} from "@/lib/retail-calculos";

type PartidaForm = { productoId: string; cantidad: string };

export type VentaFormulario = {
  contactoId: string;
  estado: string;
  canal: string;
  metodoPago: string;
  descuento: string;
  notas: string;
  partidas: PartidaForm[];
};

const BASE = {
  contactoId: "",
  estado: "pagada",
  canal: "mostrador",
  metodoPago: "efectivo",
  descuento: "0",
  notas: "",
};

export function VentaFormModal({
  abierto,
  productos,
  contactos,
  guardando,
  onClose,
  onGuardar,
}: {
  abierto: boolean;
  productos: ProductoRetail[];
  contactos: ContactoVenta[];
  guardando: boolean;
  onClose: () => void;
  onGuardar: (formulario: VentaFormulario) => Promise<void>;
}) {
  const disponibles = useMemo(
    () => productos.filter((producto) => producto.activo),
    [productos],
  );
  const [formulario, setFormulario] = useState<VentaFormulario>({
    ...BASE,
    partidas: [{ productoId: "", cantidad: "1" }],
  });

  useEffect(() => {
    if (!abierto) return;
    setFormulario({
      ...BASE,
      partidas: [{ productoId: disponibles[0]?.id ?? "", cantidad: "1" }],
    });
  }, [abierto, disponibles]);

  const subtotal = useMemo(
    () =>
      formulario.partidas.reduce((total, partida) => {
        const producto = productos.find((item) => item.id === partida.productoId);
        return total + (producto ? totalPartidaCentavos(producto.precio, partida.cantidad || 0) : 0n);
      }, 0n),
    [formulario.partidas, productos],
  );
  const descuento = centavos(formulario.descuento || 0) ?? 0n;
  const total = subtotal > descuento ? subtotal - descuento : 0n;

  function set(campo: keyof Omit<VentaFormulario, "partidas">, valor: string) {
    setFormulario((actual) => ({ ...actual, [campo]: valor }));
  }

  function setPartida(indice: number, campo: keyof PartidaForm, valor: string) {
    setFormulario((actual) => ({
      ...actual,
      partidas: actual.partidas.map((partida, posicion) =>
        posicion === indice ? { ...partida, [campo]: valor } : partida,
      ),
    }));
  }

  function agregarPartida() {
    setFormulario((actual) => ({
      ...actual,
      partidas: [...actual.partidas, { productoId: disponibles[0]?.id ?? "", cantidad: "1" }],
    }));
  }

  function quitarPartida(indice: number) {
    setFormulario((actual) => ({
      ...actual,
      partidas: actual.partidas.filter((_, posicion) => posicion !== indice),
    }));
  }

  return (
    <Modal abierto={abierto} onClose={onClose} titulo="Nueva venta o pedido">
      <form
        onSubmit={(evento) => {
          evento.preventDefault();
          void onGuardar(formulario);
        }}
        className="max-h-[76vh] space-y-4 overflow-y-auto pr-1"
      >
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted-foreground">Cliente</span>
          <select
            value={formulario.contactoId}
            onChange={(evento) => set("contactoId", evento.target.value)}
            className="w-full rounded-lg border border-input px-3 py-2 text-sm"
          >
            <option value="">Venta de mostrador, sin cliente</option>
            {contactos.map((contacto) => (
              <option key={contacto.id} value={contacto.id}>
                {contacto.nombre}{contacto.telefono ? ` · ${contacto.telefono}` : ""}
              </option>
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
          {formulario.partidas.map((partida, indice) => {
            const seleccionado = productos.find((item) => item.id === partida.productoId);
            return (
              <div key={indice} className="rounded-lg border border-border p-3">
                <div className="flex gap-2">
                  <select
                    value={partida.productoId}
                    onChange={(evento) => setPartida(indice, "productoId", evento.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-input px-2 py-2 text-sm"
                    required
                  >
                    <option value="">Selecciona un producto</option>
                    {disponibles.map((producto) => (
                      <option key={producto.id} value={producto.id}>
                        {producto.nombre} · {formatoMoneda(numeroMoneda(centavos(producto.precio) ?? 0n))}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={seleccionado?.vendePorPeso ? "0.001" : "1"}
                    step={seleccionado?.vendePorPeso ? "0.001" : "1"}
                    max={seleccionado ? String(seleccionado.stock) : undefined}
                    value={partida.cantidad}
                    onChange={(evento) => setPartida(indice, "cantidad", evento.target.value)}
                    className="w-20 rounded-lg border border-input px-2 py-2 text-sm"
                    aria-label="Cantidad"
                    required
                  />
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
                {seleccionado && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatearCantidad(seleccionado.stock, seleccionado.unidad)} disponibles
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-muted-foreground">Estado inicial</span>
            <select
              value={formulario.estado}
              onChange={(evento) => set("estado", evento.target.value)}
              className="w-full rounded-lg border border-input px-3 py-2 text-sm"
            >
              <option value="pagada">Pagada</option>
              <option value="pendiente">Pedido pendiente</option>
              <option value="borrador">Borrador</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-muted-foreground">Canal</span>
            <select
              value={formulario.canal}
              onChange={(evento) => set("canal", evento.target.value)}
              className="w-full rounded-lg border border-input px-3 py-2 text-sm"
            >
              <option value="mostrador">Mostrador</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="tienda_en_linea">Tienda en línea</option>
              <option value="telefono">Teléfono</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-muted-foreground">Método de pago</span>
            <select
              value={formulario.metodoPago}
              onChange={(evento) => set("metodoPago", evento.target.value)}
              className="w-full rounded-lg border border-input px-3 py-2 text-sm"
            >
              <option value="efectivo">Efectivo</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="transferencia">Transferencia</option>
              <option value="enlace">Enlace de pago</option>
              <option value="otro">Otro</option>
            </select>
          </label>
          <Campo
            label="Descuento"
            type="number"
            min="0"
            step="0.01"
            value={formulario.descuento}
            onChange={(evento) => set("descuento", evento.target.value)}
          />
        </div>
        <Campo
          label="Notas"
          value={formulario.notas}
          onChange={(evento) => set("notas", evento.target.value)}
        />
        <div className="rounded-lg bg-muted p-3 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Subtotal</span>
            <span>{formatoMoneda(numeroMoneda(subtotal))}</span>
          </div>
          <div className="mt-1 flex justify-between text-lg font-bold">
            <span>Total</span>
            <span>{formatoMoneda(numeroMoneda(total))}</span>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Boton type="button" variante="ghost" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton type="submit" disabled={guardando || disponibles.length === 0}>
            {guardando ? "Guardando…" : "Crear venta"}
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
