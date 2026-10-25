"use client";

import { useState } from "react";
import { Boton, Campo, Selector } from "@/components/ui";
import { toast } from "@/components/Toaster";

type Config = {
  proveedor?: string;
  moneda?: string;
  sandbox?: boolean;
  publicKey?: string;
};

export function PagosConfig({ modulo }: { modulo: { config?: Config } }) {
  const [proveedor, setProveedor] = useState(
    modulo.config?.proveedor ?? "mercado_pago",
  );
  const [moneda, setMoneda] = useState(modulo.config?.moneda ?? "MXN");
  const [sandbox, setSandbox] = useState(modulo.config?.sandbox ?? true);
  const [publicKey, setPublicKey] = useState(modulo.config?.publicKey ?? "");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    const respuesta = await fetch("/api/modulos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clave: "pagos_en_linea",
        config: { proveedor, moneda, sandbox, publicKey },
      }),
    });
    const datos = await respuesta.json().catch(() => ({}));
    setGuardando(false);
    if (!respuesta.ok)
      return toast(datos.error ?? "No se pudo guardar", "error");
    toast("Configuración de pagos guardada");
  }

  return (
    <div className="mt-3 grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
      <Selector
        label="Proveedor"
        value={proveedor}
        onChange={(e) => setProveedor(e.target.value)}
      >
        <option value="mercado_pago">Mercado Pago</option>
        <option value="mock">Mock (solo pruebas)</option>
      </Selector>
      <Selector
        label="Moneda"
        value={moneda}
        onChange={(e) => setMoneda(e.target.value)}
      >
        <option value="MXN">MXN — Peso mexicano</option>
      </Selector>
      <Campo
        label="Llave pública"
        value={publicKey}
        onChange={(e) => setPublicKey(e.target.value)}
        placeholder="APP_USR-…"
        autoComplete="off"
      />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={sandbox}
          onChange={(e) => setSandbox(e.target.checked)}
        />
        Usar checkout sandbox
      </label>
      <p className="text-xs text-muted-foreground sm:col-span-2">
        El access token y el secreto del webhook se configuran únicamente como
        variables de entorno del servidor.
      </p>
      <div>
        <Boton disabled={guardando} onClick={guardar}>
          {guardando ? "Guardando…" : "Guardar pagos"}
        </Boton>
      </div>
    </div>
  );
}
