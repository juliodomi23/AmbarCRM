"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CompraFormModal,
  type CompraFormulario,
} from "@/components/retail/CompraFormModal";
import {
  ProveedorFormModal,
  type ProveedorFormulario,
} from "@/components/retail/ProveedorFormModal";
import type {
  CompraRetail,
  ProductoRetail,
  ProveedorRetail,
} from "@/components/retail/tipos";
import { toast } from "@/components/Toaster";
import { Boton, formatoMoneda } from "@/components/ui";
import {
  centavos,
  formatearCantidad,
  formatearMilesimas,
  milesimas,
  numeroMoneda,
} from "@/lib/retail-calculos";

const ESTADOS = ["borrador", "ordenada", "recibida", "cancelada"] as const;
const ETIQUETAS: Record<string, string> = {
  borrador: "Borrador",
  ordenada: "Ordenada",
  recibida: "Recibida",
  cancelada: "Cancelada",
};
const COLORES: Record<string, string> = {
  borrador: "bg-muted text-muted-foreground",
  ordenada: "bg-warning/15 text-warning",
  recibida: "bg-success/15 text-success",
  cancelada: "bg-destructive/10 text-destructive",
};

function errorApi(payload: unknown) {
  if (payload && typeof payload === "object" && "error" in payload) {
    return String(payload.error);
  }
  return "No se pudo completar la operación";
}

export function ComprasCliente({
  compras,
  productos,
  proveedores,
}: {
  compras: CompraRetail[];
  productos: ProductoRetail[];
  proveedores: ProveedorRetail[];
}) {
  const router = useRouter();
  const [modalCompra, setModalCompra] = useState(false);
  const [modalProveedor, setModalProveedor] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const pendientes = compras.filter((compra) => compra.estado === "ordenada");
  const recibidas = compras.filter((compra) => compra.estado === "recibida");
  const inversion = recibidas.reduce((total, compra) => total + (centavos(compra.total) ?? 0n), 0n);
  const unidadesPendientes = pendientes.reduce(
    (total, compra) =>
      total + compra.partidas.reduce((suma, partida) => suma + (milesimas(partida.cantidad) ?? 0n), 0n),
    0n,
  );

  async function guardarProveedor(formulario: ProveedorFormulario) {
    setGuardando(true);
    const respuesta = await fetch("/api/compras/proveedores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formulario),
    });
    const payload = await respuesta.json().catch(() => null);
    setGuardando(false);
    if (!respuesta.ok) {
      toast(errorApi(payload), "error");
      return;
    }
    setModalProveedor(false);
    toast("Proveedor agregado");
    router.refresh();
  }

  async function guardarCompra(formulario: CompraFormulario) {
    setGuardando(true);
    const respuesta = await fetch("/api/compras", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formulario),
    });
    const payload = await respuesta.json().catch(() => null);
    setGuardando(false);
    if (!respuesta.ok) {
      toast(errorApi(payload), "error");
      return;
    }
    setModalCompra(false);
    toast(
      formulario.estado === "recibida"
        ? "Compra recibida e inventario actualizado"
        : "Orden de compra creada",
    );
    router.refresh();
  }

  async function cambiarEstado(compra: CompraRetail, estado: string) {
    const respuesta = await fetch(`/api/compras/${compra.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado }),
    });
    const payload = await respuesta.json().catch(() => null);
    if (!respuesta.ok) {
      toast(errorApi(payload), "error");
      return;
    }
    toast(estado === "recibida" ? "Mercancía sumada al inventario" : "Estado actualizado");
    router.refresh();
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Compras y proveedores</h1>
          <p className="text-sm text-muted-foreground">
            Reabastecimiento, costos y recepción de mercancía.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/productos" className="rounded-lg bg-muted px-3.5 py-2 text-sm font-medium">
            Ver inventario
          </Link>
          <Boton variante="ghost" onClick={() => setModalProveedor(true)}>+ Proveedor</Boton>
          <Boton onClick={() => setModalCompra(true)}>+ Orden de compra</Boton>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi etiqueta="Órdenes por recibir" valor={String(pendientes.length)} />
        <Kpi etiqueta="Cantidad por recibir" valor={formatearMilesimas(unidadesPendientes)} />
        <Kpi
          etiqueta="Proveedores activos"
          valor={String(proveedores.filter((proveedor) => proveedor.activo).length)}
        />
        <Kpi etiqueta="Compras recibidas" valor={formatoMoneda(numeroMoneda(inversion))} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="space-y-3">
          <h2 className="font-semibold">Órdenes de compra</h2>
          {compras.map((compra) => (
            <article key={compra.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{compra.folio}</h3>
                    <span className={`rounded-full px-2 py-1 text-xs ${COLORES[compra.estado]}`}>
                      {ETIQUETAS[compra.estado]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {compra.proveedor.nombre}
                    {compra.creadoPor ? ` · ${compra.creadoPor.nombre}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold">
                    {formatoMoneda(numeroMoneda(centavos(compra.total) ?? 0n))}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(compra.createdAt).toLocaleDateString("es-MX")}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t pt-3">
                <p className="text-sm text-muted-foreground">
                  {compra.partidas.map((partida) => (
                    <span key={partida.id} className="mr-3 inline-block">
                      {formatearCantidad(partida.cantidad, partida.producto.unidad)} × {partida.producto.nombre}
                    </span>
                  ))}
                </p>
                <label className="space-y-1 text-xs text-muted-foreground">
                  <span className="block">Estado</span>
                  <select
                    value={compra.estado}
                    onChange={(evento) => void cambiarEstado(compra, evento.target.value)}
                    className="rounded-lg border border-input bg-card px-2 py-1.5 text-sm text-foreground"
                  >
                    {ESTADOS.map((estado) => (
                      <option key={estado} value={estado}>{ETIQUETAS[estado]}</option>
                    ))}
                  </select>
                </label>
              </div>
            </article>
          ))}
          {compras.length === 0 && (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Aún no hay órdenes de compra.
            </div>
          )}
        </div>

        <aside className="rounded-xl border border-border bg-card p-4">
          <h2 className="font-semibold">Proveedores</h2>
          <div className="mt-3 divide-y divide-border">
            {proveedores.map((proveedor) => (
              <div key={proveedor.id} className="py-3 first:pt-0">
                <p className="font-medium">{proveedor.nombre}</p>
                <p className="text-xs text-muted-foreground">
                  {proveedor.contactoNombre ?? "Sin contacto"}
                  {proveedor.telefono ? ` · ${proveedor.telefono}` : ""}
                </p>
              </div>
            ))}
            {proveedores.length === 0 && (
              <p className="text-sm text-muted-foreground">Agrega el primer proveedor.</p>
            )}
          </div>
        </aside>
      </section>

      <ProveedorFormModal
        abierto={modalProveedor}
        guardando={guardando}
        onClose={() => setModalProveedor(false)}
        onGuardar={guardarProveedor}
      />
      <CompraFormModal
        abierto={modalCompra}
        productos={productos}
        proveedores={proveedores}
        guardando={guardando}
        onClose={() => setModalCompra(false)}
        onGuardar={guardarCompra}
      />
    </div>
  );
}

function Kpi({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <p className="text-xs uppercase text-muted-foreground">{etiqueta}</p>
      <p className="mt-1 text-2xl font-bold">{valor}</p>
    </div>
  );
}
