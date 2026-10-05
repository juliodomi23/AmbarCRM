"use client";

import { useEffect } from "react";
import { BrandConfig, variablesMarca } from "@/lib/brand";

export function BrandRuntime({ marca }: { marca: BrandConfig }) {
  useEffect(() => {
    const root = document.documentElement;
    const variables = variablesMarca(marca);
    for (const [nombre, valor] of Object.entries(variables)) root.style.setProperty(nombre, valor);
    return () => {
      for (const nombre of Object.keys(variables)) root.style.removeProperty(nombre);
    };
  }, [marca]);
  return null;
}
