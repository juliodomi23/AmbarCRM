"use client";
import { useEffect } from "react";

export function useFocoModal(abierto: boolean) {
  useEffect(() => {
    if (!abierto) return;
    const anterior = document.activeElement as HTMLElement | null;
    const dialogo = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].at(-1);
    if (!dialogo) return;
    const controles = () => [...dialogo.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')];
    controles()[0]?.focus();
    const enfocar = (evento: KeyboardEvent) => {
      if (evento.key !== "Tab") return;
      const elementos = controles();
      const primero = elementos[0], ultimo = elementos.at(-1);
      if (evento.shiftKey && document.activeElement === primero) { evento.preventDefault(); ultimo?.focus(); }
      else if (!evento.shiftKey && document.activeElement === ultimo) { evento.preventDefault(); primero?.focus(); }
    };
    dialogo.addEventListener("keydown", enfocar);
    return () => { dialogo.removeEventListener("keydown", enfocar); anterior?.focus(); };
  }, [abierto]);
}
