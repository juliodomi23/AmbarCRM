"use client";

import { useEffect } from "react";

async function imprimirCuandoEsteListo() {
  await document.fonts.ready;
  await Promise.all(
    [...document.images].map(async (imagen) => {
      if (!imagen.complete) {
        await new Promise<void>((resolve) => {
          imagen.addEventListener("load", () => resolve(), { once: true });
          imagen.addEventListener("error", () => resolve(), { once: true });
        });
      }
      await imagen.decode().catch(() => undefined);
    }),
  );
  window.print();
}

export function BotonImprimir({ automatico = false }: { automatico?: boolean }) {
  useEffect(() => {
    if (automatico) void imprimirCuandoEsteListo();
  }, [automatico]);

  return (
    <button
      onClick={() => void imprimirCuandoEsteListo()}
      className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
    >
      Imprimir ticket
    </button>
  );
}

export function AbrirTicket({ ventaId, children }: { ventaId: string; children: React.ReactNode }) {
  function abrir() {
    window.open(
      `/caja/ticket/${encodeURIComponent(ventaId)}?imprimir=1&ancho=80`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <button
      type="button"
      onClick={abrir}
      className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
    >
      {children}
    </button>
  );
}
