"use client";

import { useEffect } from "react";

export function Boton({
  children,
  variante = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: "primary" | "ghost" | "danger" }) {
  const estilos = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-glow",
    ghost: "bg-muted text-foreground hover:bg-muted/70",
    danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90"
  }[variante];
  return (
    <button className={`cursor-pointer rounded-lg px-3.5 py-2 text-sm font-medium transition duration-150 active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none disabled:active:scale-100 ${estilos} ${className}`} {...props}>
      {children}
    </button>
  );
}

/** Clase base de input/select/textarea: legible en claro y oscuro, con foco visible. */
export const CLASE_CAMPO =
  "w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:border-primary/60 focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60";

export function Campo({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <input className={CLASE_CAMPO} {...props} />
    </label>
  );
}

export function Selector({
  label,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <select className={CLASE_CAMPO} {...props}>{children}</select>
    </label>
  );
}

/** Encabezado estándar de página: título, línea de contexto y acciones a la derecha. */
export function EncabezadoPagina({
  titulo,
  descripcion,
  eyebrow,
  acciones,
  className = ""
}: {
  titulo: React.ReactNode;
  descripcion?: React.ReactNode;
  eyebrow?: string;
  acciones?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={`flex flex-wrap items-end justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>}
        <h1 className="text-2xl font-bold text-foreground">{titulo}</h1>
        {descripcion && <p className="mt-0.5 text-sm text-muted-foreground">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </header>
  );
}

export type TonoBadge = "neutral" | "primary" | "success" | "warning" | "info" | "destructive";

const TONOS_BADGE: Record<TonoBadge, string> = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/15 text-warning",
  info: "bg-info/10 text-info",
  destructive: "bg-destructive/10 text-destructive"
};

/** Etiqueta de estado con los colores del tema. Pasa siempre texto: el color no comunica por sí solo. */
export function Badge({
  tono = "neutral",
  punto = false,
  className = "",
  children
}: {
  tono?: TonoBadge;
  punto?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${TONOS_BADGE[tono]} ${className}`}>
      {punto && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function Modal({
  abierto,
  onClose,
  titulo,
  children
}: {
  abierto: boolean;
  onClose: () => void;
  titulo: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (abierto) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abierto, onClose]);

  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="animate-fade-in absolute inset-0 bg-foreground/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="surface surface-pop animate-pop relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl p-5 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold text-primary">{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

/** Visor de imagen en overlay (clic o Escape para cerrar), sin salir de la página. */
export function Lightbox({ url, onClose }: { url: string | null; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (url) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [url, onClose]);

  if (!url) return null;
  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/85 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Imagen ampliada"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="imagen" className="max-h-[92vh] max-w-[92vw] rounded-lg object-contain" />
      <button
        onClick={onClose}
        aria-label="Cerrar"
        className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-card/10 text-xl text-white hover:bg-card/20"
      >
        ✕
      </button>
    </div>
  );
}

export function formatoMoneda(valor: number, moneda = "MXN") {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: moneda, maximumFractionDigits: 0 }).format(valor);
}
