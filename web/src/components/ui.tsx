"use client";

import { useEffect } from "react";

export function Boton({
  children,
  variante = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: "primary" | "ghost" | "danger" }) {
  const estilos = {
    primary: "bg-navy text-white hover:bg-navy/90",
    ghost: "bg-slate-100 text-slate-700 hover:bg-slate-200",
    danger: "bg-red-600 text-white hover:bg-red-700"
  }[variante];
  return (
    <button className={`cursor-pointer rounded-lg px-3.5 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 focus-visible:ring-offset-1 disabled:opacity-60 disabled:cursor-not-allowed ${estilos} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Campo({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-slate-600">{label}</span>
      <input
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-navy/30"
        {...props}
      />
    </label>
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
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-navy">{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

export function formatoMoneda(valor: number, moneda = "MXN") {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: moneda, maximumFractionDigits: 0 }).format(valor);
}
