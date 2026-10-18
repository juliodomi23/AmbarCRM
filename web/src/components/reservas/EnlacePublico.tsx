"use client";

import { toast } from "@/components/Toaster";

/** Enlace público de reservas, listo para copiar y mandar por WhatsApp o redes. */
export function EnlacePublico({ url }: { url: string }) {
  async function copiar() {
    try { await navigator.clipboard.writeText(url); toast("Enlace copiado"); }
    catch { toast("No se pudo copiar. Selecciona el enlace y cópialo manualmente.", "error"); }
  }
  return (
    <div className="surface flex flex-wrap items-center gap-2 p-3">
      <code className="min-w-0 flex-1 truncate text-sm">{url}</code>
      <button type="button" onClick={copiar} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 active:scale-[.98]">
        Copiar
      </button>
      <a href={url} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary hover:underline">
        Abrir
      </a>
    </div>
  );
}
