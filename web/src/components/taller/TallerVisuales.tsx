import type { ReactNode } from "react";
import { TallerIcono } from "@/components/taller/TallerIcono";

export const estadosTaller: Record<string, string> = {
  sin_servicios: "Sin servicios",
  recibido: "Recibido", diagnostico: "Diagnóstico", esperando_aprobacion: "Esperando aprobación",
  en_reparacion: "En reparación", listo: "Listo para entrega", entregado: "Entregado", cancelado: "Cancelado",
};

export function nombreEstadoTaller(estado: string) { return estadosTaller[estado] ?? estado.replaceAll("_", " "); }
export function monedaTaller(valor: number | string) { return Number(valor).toLocaleString("es-MX", { style: "currency", currency: "MXN" }); }
export function numeroTaller(valor: number | string) { return Number(valor).toLocaleString("es-MX"); }

export function EstadoTaller({ estado }: { estado: string }) {
  const tono = estado === "sin_servicios" ? "border-border bg-muted text-muted-foreground" : estado === "cancelado" ? "border-destructive/30 bg-destructive/10 text-destructive" : estado === "entregado" ? "border-success/30 bg-success/10 text-success" : estado === "esperando_aprobacion" ? "border-warning/40 bg-warning/10 text-warning" : estado === "en_reparacion" || estado === "listo" ? "border-info/30 bg-info/10 text-info" : "border-primary/20 bg-primary/10 text-primary";
  return <span className={`inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold ${tono}`}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{nombreEstadoTaller(estado)}</span>;
}

export function PlacaVehiculo({ placa, grande = false }: { placa: string; grande?: boolean }) {
  return <span className={`inline-flex items-center gap-2 rounded-lg border-2 border-border bg-card px-3 py-1.5 font-semibold tracking-[.12em] text-foreground shadow-soft ${grande ? "min-h-12 text-base" : "min-h-9 text-xs"}`}>
    <span className="grid h-5 w-5 place-items-center rounded border border-border bg-muted text-primary" aria-hidden="true"><TallerIcono nombre="vehiculo" className="h-3.5 w-3.5" /></span>
    <span className="tnum">{placa}</span>
  </span>;
}

export function VacioTaller({ titulo, detalle, accion }: { titulo: string; detalle: string; accion?: ReactNode }) {
  return <div className="surface flex min-h-52 flex-col items-center justify-center gap-2 px-5 py-8 text-center">
    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary"><TallerIcono nombre="vacio" className="h-6 w-6" /></span>
    <h2 className="text-base font-semibold text-foreground">{titulo}</h2>
    <p className="max-w-md text-sm text-muted-foreground">{detalle}</p>
    {accion}
  </div>;
}
