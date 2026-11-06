"use client";

import { useEffect } from "react";
import { Boton } from "@/components/ui";

async function imprimir() {
  if (document.fonts?.ready) await document.fonts.ready;
  window.print();
}

export function BotonImprimirDoc({ automatico = false }: { automatico?: boolean }) {
  useEffect(() => {
    if (automatico) void imprimir();
  }, [automatico]);
  return (
    <Boton className="min-h-11" onClick={() => void imprimir()}>
      Imprimir
    </Boton>
  );
}
