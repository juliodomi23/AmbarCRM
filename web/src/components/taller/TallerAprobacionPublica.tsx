"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { TallerIcono } from "@/components/taller/TallerIcono";

type Cotizacion = {
  numero: string;
  total: string;
  vehiculo: { placa: string; marca: string; modelo: string };
  conceptos: { tipo: string; descripcion: string; cantidad: string; precioUnitario: string }[];
};
type EstadoRespuesta = "aprobada" | "rechazada" | "respondida" | "no-disponible" | "error";

const formatoDinero = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export function TallerAprobacionPublica({ token, marca }: { token: string; marca: { nombre: string; logo: string | null } }) {
  const [orden, setOrden] = useState<Cotizacion | null>(null);
  const [estado, setEstado] = useState<EstadoRespuesta | null>(null);
  const [mensajeError, setMensajeError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let vigente = true;
    fetch(`/api/taller-aprobacion/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "No se pudo abrir la aprobación");
        if (vigente) setOrden(data.orden);
      })
      .catch((error: unknown) => {
        if (!vigente) return;
        const mensaje = error instanceof Error ? error.message : "No se pudo abrir la aprobación";
        setMensajeError(mensaje);
        setEstado(mensaje.includes("no disponible") ? "no-disponible" : "error");
      });
    return () => { vigente = false; };
  }, [token]);

  async function responder(decision: "aprobar" | "rechazar") {
    setBusy(true);
    try {
      const response = await fetch(`/api/taller-aprobacion/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          setEstado("respondida");
          return;
        }
        throw new Error(data.error || "No se pudo registrar la respuesta");
      }
      setEstado(decision === "aprobar" ? "aprobada" : "rechazada");
    } catch (error) {
      setMensajeError(error instanceof Error ? error.message : "No se pudo registrar la respuesta");
      setEstado("error");
    } finally {
      setBusy(false);
    }
  }

  if (estado) {
    const resultado = {
      aprobada: { titulo: "Aprobación registrada", detalle: "El taller recibió tu autorización para iniciar los trabajos.", icono: "check" as const, color: "text-success", fondo: "bg-success/10" },
      rechazada: { titulo: "Cotización rechazada", detalle: "El taller recibió tu respuesta y podrá revisar el diagnóstico.", icono: "orden" as const, color: "text-primary", fondo: "bg-primary/10" },
      respondida: { titulo: "Esta aprobación ya fue respondida", detalle: "El enlace ya se utilizó. Si necesitas hacer un cambio, contacta al taller.", icono: "check" as const, color: "text-info", fondo: "bg-info/10" },
      "no-disponible": { titulo: "Aprobación no disponible", detalle: "Este enlace ya no está disponible. Contacta al taller para recibir ayuda.", icono: "vacio" as const, color: "text-muted-foreground", fondo: "bg-muted" },
      error: { titulo: "No se pudo abrir la aprobación", detalle: mensajeError, icono: "vacio" as const, color: "text-destructive", fondo: "bg-destructive/10" },
    }[estado];

    return <section role="status" aria-live="polite" className="surface mx-auto flex min-h-72 max-w-lg flex-col items-center justify-center gap-4 p-6 text-center sm:p-10">
      <span className={`grid h-16 w-16 place-items-center rounded-2xl ${resultado.fondo} ${resultado.color}`}><TallerIcono nombre={resultado.icono} className="h-8 w-8" /></span>
      <div className="space-y-2"><h1 className="text-2xl font-bold font-display">{resultado.titulo}</h1><p className="max-w-sm text-sm leading-6 text-muted-foreground">{resultado.detalle}</p></div>
    </section>;
  }

  if (!orden) return <section aria-label="Cargando cotización" className="surface mx-auto max-w-lg space-y-5 p-5 sm:p-7">
    <div className="skeleton h-8 w-40" />
    <div className="skeleton h-24 w-full rounded-xl" />
    <div className="space-y-3"><div className="skeleton h-12 w-full" /><div className="skeleton h-12 w-full" /><div className="skeleton h-12 w-full" /></div>
    <div className="skeleton ml-auto h-12 w-44" />
    <div className="skeleton h-12 w-full rounded-lg" />
  </section>;

  return <div className="mx-auto max-w-lg space-y-5">
    <header className="flex items-center gap-3 px-1 py-2">
      {marca.logo ? <Image src={marca.logo} alt="" width={48} height={48} unoptimized className="h-12 w-12 shrink-0 rounded-xl object-contain" /> : <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><TallerIcono nombre="herramienta" className="h-6 w-6" /></span>}
      <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Aprobación de servicio</p><p className="truncate font-display text-lg font-bold">{marca.nombre}</p></div>
    </header>

    <section className="surface overflow-hidden">
      <div className="border-b border-border/70 bg-primary/5 p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Orden <span className="tnum">#{orden.numero}</span></p>
        <h1 className="mt-1 font-display text-2xl font-bold">Revisa la cotización</h1>
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="inline-flex min-h-9 items-center rounded-lg border-2 border-foreground/70 bg-card px-3 font-mono text-sm font-bold tracking-widest text-foreground">{orden.vehiculo.placa}</span>
          <span className="text-sm font-semibold">{orden.vehiculo.marca} {orden.vehiculo.modelo}</span>
        </div>
      </div>

      <div className="space-y-1 p-5 sm:p-6">
        <h2 className="mb-2 text-sm font-semibold">Trabajos y piezas</h2>
        {orden.conceptos.map((concepto, index) => {
          const cantidad = Number(concepto.cantidad);
          const precio = Number(concepto.precioUnitario);
          return <div key={`${concepto.descripcion}-${index}`} className="flex items-start gap-3 border-t border-border/60 py-3">
            <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${concepto.tipo === "refaccion" ? "bg-info/10 text-info" : "bg-primary/10 text-primary"}`}><TallerIcono nombre={concepto.tipo === "refaccion" ? "refaccion" : "herramienta"} className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1"><p className="text-sm font-medium leading-5">{concepto.descripcion}</p><p className="tnum mt-1 text-xs text-muted-foreground">{cantidad} × {formatoDinero.format(precio)}</p></div>
            <strong className="tnum whitespace-nowrap text-sm">{formatoDinero.format(cantidad * precio)}</strong>
          </div>;
        })}
      </div>

      <div className="border-t border-border/70 bg-muted/30 p-5 sm:p-6">
        <p className="text-sm text-muted-foreground">Total de la reparación</p>
        <p className="tnum mt-1 font-display text-3xl font-bold tracking-tight">{formatoDinero.format(Number(orden.total))}</p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Al aprobar, autorizas que el taller inicie los trabajos descritos.</p>
      </div>
      <div className="grid gap-3 p-5 sm:p-6 sm:pt-4">
        <button type="button" disabled={busy} onClick={() => void responder("aprobar")} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-base font-semibold text-primary-foreground shadow-soft transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-wait disabled:opacity-60">
          <TallerIcono nombre="check" className="h-5 w-5" />{busy ? "Enviando respuesta…" : "Aprobar"}
        </button>
        <button type="button" disabled={busy} onClick={() => void responder("rechazar")} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card px-5 text-sm font-semibold text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-wait disabled:opacity-60">
          <TallerIcono nombre="orden" className="h-5 w-5" />Rechazar
        </button>
      </div>
    </section>
    <p className="px-2 text-center text-xs leading-5 text-muted-foreground">Si tienes dudas sobre esta cotización, comunícate directamente con el taller.</p>
  </div>;
}
