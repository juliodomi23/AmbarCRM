"use client";

import { useEffect, useId, useRef } from "react";

export function DialogoCampana({ titulo, subtitulo, onCerrar, children }: {
  titulo: string; subtitulo: string; onCerrar: () => void; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialogo = ref.current;
    const anterior = document.activeElement as HTMLElement | null;
    dialogo?.showModal();
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialogo?.close();
      document.body.style.overflow = overflowAnterior;
      anterior?.focus();
    };
  }, []);
  return (
    <dialog ref={ref} aria-labelledby={`${id}-titulo`} aria-describedby={`${id}-subtitulo`}
      onCancel={(evento) => { evento.preventDefault(); onCerrar(); }}
      className="m-auto max-h-[94dvh] w-[calc(100%-1rem)] max-w-4xl overflow-y-auto rounded-2xl border border-border bg-card p-0 text-foreground shadow-pop backdrop:bg-foreground/40 backdrop:backdrop-blur-sm">
      <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-card p-4 sm:px-6">
        <div className="min-w-0">
          <h2 id={`${id}-titulo`} className="break-words text-lg font-semibold">{titulo}</h2>
          <p id={`${id}-subtitulo`} className="mt-1 text-sm text-muted-foreground">{subtitulo}</p>
        </div>
        <button type="button" onClick={onCerrar} aria-label="Cerrar ventana" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-muted text-xl hover:bg-muted/70">×</button>
      </header>
      {children}
    </dialog>
  );
}
