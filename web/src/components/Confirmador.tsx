"use client";

import { useEffect, useRef, useState } from "react";

type Opciones = { titulo?: string; mensaje: string; confirmar?: string; cancelar?: string; peligro?: boolean };
type Pendiente = Opciones & { responder: (ok: boolean) => void };

// Mismo patrón que el Toaster: cualquier componente hace `await confirmar(...)` y el <Confirmador/> lo pinta.
let abrir: ((p: Pendiente) => void) | null = null;

/** Reemplazo de window.confirm con el estilo de la app. Resuelve true al confirmar. */
export function confirmar(opciones: Opciones | string): Promise<boolean> {
  const datos = typeof opciones === "string" ? { mensaje: opciones } : opciones;
  if (!abrir) return Promise.resolve(window.confirm(datos.mensaje));
  return new Promise((responder) => abrir!({ ...datos, responder }));
}

export function Confirmador() {
  const [actual, setActual] = useState<Pendiente | null>(null);
  const botonConfirmar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    abrir = setActual;
    return () => { abrir = null; };
  }, []);

  useEffect(() => {
    if (!actual) return;
    botonConfirmar.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") cerrar(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function cerrar(ok: boolean) {
    actual?.responder(ok);
    setActual(null);
  }

  if (!actual) return null;
  const peligro = actual.peligro ?? true;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4" role="alertdialog" aria-modal="true" aria-labelledby="confirmador-titulo" aria-describedby="confirmador-mensaje">
      <div className="animate-fade-in absolute inset-0 bg-foreground/40 backdrop-blur-[2px]" onClick={() => cerrar(false)} />
      <div className="surface surface-pop animate-pop relative w-full max-w-sm p-6">
        <div className={`mb-4 grid h-11 w-11 place-items-center rounded-full ${peligro ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {peligro ? (
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            ) : (
              <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
            )}
          </svg>
        </div>
        <h2 id="confirmador-titulo" className="text-base font-semibold text-foreground">{actual.titulo ?? "¿Estás seguro?"}</h2>
        <p id="confirmador-mensaje" className="mt-1.5 whitespace-pre-line text-sm text-muted-foreground">{actual.mensaje}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={() => cerrar(false)} className="rounded-lg bg-muted px-3.5 py-2 text-sm font-medium text-foreground transition duration-150 hover:bg-muted/70 active:scale-[.98]">
            {actual.cancelar ?? "Cancelar"}
          </button>
          <button
            ref={botonConfirmar}
            type="button"
            onClick={() => cerrar(true)}
            className={`rounded-lg px-3.5 py-2 text-sm font-medium transition duration-150 active:scale-[.98] ${peligro ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
          >
            {actual.confirmar ?? (peligro ? "Eliminar" : "Aceptar")}
          </button>
        </div>
      </div>
    </div>
  );
}
