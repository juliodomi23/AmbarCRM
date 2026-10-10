"use client";

import { useMemo, useState } from "react";
import { origenValido } from "@/lib/resenas";
import { qrSvg } from "@/lib/qr-svg";

/** Un QR por origen (mostrador, mesa-3…) listo para imprimir; el origen alimenta el conteo del panel. */
export function QrPorOrigen({ base, origenes }: { base: string; origenes: string[] }) {
  const [nuevo, setNuevo] = useState("");
  const [extra, setExtra] = useState<string[]>([]);
  const lista = useMemo(() => [...new Set(["directo", ...origenes, ...extra])], [origenes, extra]);

  function agregar() {
    const texto = nuevo.trim().toLowerCase();
    const origen = origenValido(texto);
    if (!texto || origen !== texto) return;
    setExtra((actual) => [...actual, origen]);
    setNuevo("");
  }

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h2 className="font-semibold">QR por origen</h2>
          <p className="text-xs text-muted-foreground">Letras minúsculas, números, guion y guion bajo (máx. 40).</p>
        </div>
        <div className="flex gap-2">
          <input
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && agregar()}
            placeholder="mesa-3"
            className="rounded-lg border bg-card px-3 py-2 text-sm"
          />
          <button type="button" onClick={agregar} className="rounded-lg bg-muted px-3 py-2 text-sm font-medium">Agregar</button>
          <button type="button" onClick={() => window.print()} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">Imprimir</button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {lista.map((origen) => {
          const url = `${base}?o=${origen}`;
          return (
            <figure key={origen} className="flex flex-col items-center gap-1 rounded-lg border p-3 text-center">
              <div dangerouslySetInnerHTML={{ __html: qrSvg(url, 180) }} />
              <figcaption className="text-sm font-medium">{origen}</figcaption>
              <code className="break-all text-[10px] text-muted-foreground">{url}</code>
            </figure>
          );
        })}
      </div>
    </section>
  );
}
