"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ContactoVenta,
  ProductoRetail,
  VentaRetail,
} from "@/components/retail/tipos";
import {
  VentaFormModal,
  type VentaFormulario,
} from "@/components/retail/VentaFormModal";
import { toast } from "@/components/Toaster";
import { Boton, formatoMoneda } from "@/components/ui";
import {
  centavos,
  compararCantidades,
  formatearCantidad,
  numeroMoneda,
} from "@/lib/retail-calculos";

const ESTADOS = [
  "borrador",
  "pendiente",
  "pagada",
  "preparando",
  "lista",
  "entregada",
  "cancelada",
] as const;

const ETIQUETAS: Record<string, string> = {
  borrador: "Borrador",
  pendiente: "Pendiente",
  pagada: "Pagada",
  preparando: "Preparando",
  lista: "Lista para entregar",
  entregada: "Entregada",
  cancelada: "Cancelada",
  mostrador: "Mostrador",
  whatsapp: "WhatsApp",
  tienda_en_linea: "Tienda en línea",
  telefono: "Teléfono",
};

const COLOR_ESTADO: Record<string, string> = {
  borrador: "bg-muted text-muted-foreground",
  pendiente: "bg-warning/15 text-warning",
  pagada: "bg-info/15 text-info",
  preparando: "bg-primary/10 text-primary",
  lista: "bg-success/15 text-success",
  entregada: "bg-success/15 text-success",
  cancelada: "bg-destructive/10 text-destructive",
};

function errorApi(payload: unknown) {
  if (payload && typeof payload === "object" && "error" in payload) {
    return String(payload.error);
  }
  return "No se pudo completar la operación";
}

function claveMexico(fecha: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fecha);
}

export function VentasCliente({
  ventas,
  productos,
  contactos,
}: {
  ventas: VentaRetail[];
  productos: ProductoRetail[];
  contactos: ContactoVenta[];
}) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("");
  const [modal, setModal] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const filtradas = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    return ventas.filter((venta) => {
      if (estado && venta.estado !== estado) return false;
      if (!termino) return true;
      return [
        venta.folio,
        venta.contacto?.nombre,
        ...venta.partidas.map((partida) => partida.producto.nombre),
      ]
        .filter(Boolean)
        .some((valor) => valor!.toLowerCase().includes(termino));
    });
  }, [busqueda, estado, ventas]);

  const hoy = claveMexico(new Date());
  const ventasHoy = ventas.filter(
    (venta) => claveMexico(new Date(venta.createdAt)) === hoy && venta.estado !== "cancelada",
  );
  const cobradasHoy = ventasHoy.filter((venta) =>
    ["pagada", "preparando", "lista", "entregada"].includes(venta.estado),
  );
  const ingresoHoy = cobradasHoy.reduce((total, venta) => total + (centavos(venta.total) ?? 0n), 0n);
  const pedidosAbiertos = ventas.filter((venta) =>
    ["pendiente", "pagada", "preparando", "lista"].includes(venta.estado),
  ).length;
  const divisorTicket = BigInt(cobradasHoy.length || 1);
  const ticket = cobradasHoy.length ? (ingresoHoy + divisorTicket / 2n) / divisorTicket : 0n;

  async function guardarVenta(formulario: VentaFormulario) {
    setGuardando(true);
    const respuesta = await fetch("/api/ventas", {
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
    setModal(false);
    toast("Venta registrada e inventario actualizado");
    router.refresh();
  }

  async function cambiarEstado(venta: VentaRetail, nuevoEstado: string) {
    const respuesta = await fetch(`/api/ventas/${venta.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: nuevoEstado }),
    });
    const payload = await respuesta.json().catch(() => null);
    if (!respuesta.ok) {
      toast(errorApi(payload), "error");
      return;
    }
    toast(nuevoEstado === "cancelada" ? "Venta cancelada; stock devuelto" : "Estado actualizado");
    router.refresh();
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Ventas y pedidos</h1>
          <p className="text-sm text-muted-foreground">
            Mostrador, WhatsApp, pedidos en línea y preparación.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/productos" className="rounded-lg bg-muted px-3.5 py-2 text-sm font-medium">
            Ver inventario
          </Link>
          <Boton onClick={() => setModal(true)}>+ Nueva venta</Boton>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi etiqueta="Ventas de hoy" valor={String(ventasHoy.length)} />
        <Kpi etiqueta="Ingreso cobrado hoy" valor={formatoMoneda(numeroMoneda(ingresoHoy))} />
        <Kpi etiqueta="Pedidos abiertos" valor={String(pedidosAbiertos)} />
        <Kpi etiqueta="Ticket promedio hoy" valor={formatoMoneda(numeroMoneda(ticket))} />
      </section>

      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          value={busqueda}
          onChange={(evento) => setBusqueda(evento.target.value)}
          placeholder="Buscar folio, cliente o producto…"
          className="min-w-64 flex-1 rounded-lg border border-input bg-card px-3 py-2 text-sm"
        />
        <select
          value={estado}
          onChange={(evento) => setEstado(evento.target.value)}
          className="rounded-lg border border-input bg-card px-3 py-2 text-sm"
        >
          <option value="">Todos los estados</option>
          {ESTADOS.map((item) => (
            <option key={item} value={item}>{ETIQUETAS[item]}</option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {filtradas.map((venta) => (
          <article key={venta.id} className="rounded-xl border border-border bg-card p-4 shadow-soft">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold">{venta.folio}</h2>
                  <span className={`rounded-full px-2 py-1 text-xs ${COLOR_ESTADO[venta.estado]}`}>
                    {ETIQUETAS[venta.estado]}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {venta.contacto?.nombre ?? "Venta de mostrador"} · {ETIQUETAS[venta.canal]}
                  {venta.creadoPor ? ` · ${venta.creadoPor.nombre}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold">
                  {formatoMoneda(numeroMoneda(centavos(venta.total) ?? 0n))}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(venta.createdAt).toLocaleString("es-MX", {
                    timeZone: "America/Mexico_City",
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-border pt-3">
              <div className="text-sm text-muted-foreground">
                {venta.partidas.map((partida) => (
                  <span key={partida.id} className="mr-3 inline-block">
                    {formatearCantidad(partida.cantidad, partida.producto.unidad)} × {partida.producto.nombre}
                  </span>
                ))}
                {compararCantidades(venta.descuento, 0) > 0 && (
                  <span className="inline-block">
                    Descuento: {formatoMoneda(numeroMoneda(centavos(venta.descuento) ?? 0n))}
                  </span>
                )}
              </div>
              <label className="space-y-1 text-xs text-muted-foreground">
                <span className="block">Cambiar estado</span>
                <select
                  value={venta.estado}
                  onChange={(evento) => void cambiarEstado(venta, evento.target.value)}
                  className="rounded-lg border border-input bg-card px-2 py-1.5 text-sm text-foreground"
                >
                  {ESTADOS.map((item) => (
                    <option key={item} value={item}>{ETIQUETAS[item]}</option>
                  ))}
                </select>
              </label>
            </div>
          </article>
        ))}
        {filtradas.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <p className="font-semibold">No hay ventas con esos filtros</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Registra una venta de mostrador o un pedido de WhatsApp.
            </p>
          </div>
        )}
      </div>

      <VentaFormModal
        abierto={modal}
        productos={productos}
        contactos={contactos}
        guardando={guardando}
        onClose={() => setModal(false)}
        onGuardar={guardarVenta}
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
