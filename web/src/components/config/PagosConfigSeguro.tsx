"use client";

import { useEffect, useState } from "react";
import { Boton, Campo, Selector } from "@/components/ui";
import { toast } from "@/components/Toaster";

type EstadoCredencial = {
  proveedor: string;
  publicKey: string | null;
  sandbox: boolean;
  configurado: boolean;
};

export function PagosConfig({ modulo: _modulo }: { modulo: { config?: unknown } }) {
  const [proveedor, setProveedor] = useState("mercado_pago");
  const [sandbox, setSandbox] = useState(true);
  const [publicKey, setPublicKey] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [configurado, setConfigurado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    void fetch("/api/pagos/credenciales")
      .then(async (respuesta) => respuesta.ok ? respuesta.json() : null)
      .then((datos: { credencial?: EstadoCredencial | null } | null) => {
        if (!datos?.credencial) return;
        setProveedor(datos.credencial.proveedor);
        setSandbox(datos.credencial.sandbox);
        setPublicKey(datos.credencial.publicKey ?? "");
        setConfigurado(datos.credencial.configurado);
      });
  }, []);

  async function guardar() {
    setGuardando(true);
    try {
      const respuesta = await fetch("/api/pagos/credenciales", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proveedor, sandbox, publicKey, accessToken, webhookSecret }),
      });
      const datos = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) return toast(datos.error ?? "No se pudo guardar", "error");
      setAccessToken("");
      setWebhookSecret("");
      setConfigurado(true);
      toast("Credenciales de pagos guardadas de forma segura");
    } finally {
      setGuardando(false);
    }
  }

  async function borrar() {
    setGuardando(true);
    try {
      const respuesta = await fetch("/api/pagos/credenciales", { method: "DELETE" });
      if (!respuesta.ok) return toast("No se pudieron desactivar las credenciales", "error");
      setConfigurado(false);
      toast("Credenciales de pagos desactivadas");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mt-3 grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <span className={`rounded-full px-2 py-1 text-xs ${configurado ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
          {configurado ? "Credenciales configuradas" : "Credenciales pendientes"}
        </span>
      </div>
      <Selector label="Proveedor" value={proveedor} onChange={(e) => setProveedor(e.target.value)}>
        <option value="mercado_pago">Mercado Pago</option>
        <option value="mock">Mock (solo pruebas)</option>
      </Selector>
      <Campo label="Llave pública" value={publicKey} onChange={(e) => setPublicKey(e.target.value)} placeholder="APP_USR-…" autoComplete="off" />
      <Campo label="Access token" type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder={configurado ? "Escribe uno nuevo para reemplazarlo" : "APP_USR-…"} autoComplete="new-password" />
      <Campo label="Secreto del webhook" type="password" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder={configurado ? "Escribe uno nuevo para reemplazarlo" : "Secreto del proveedor"} autoComplete="new-password" />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={sandbox} onChange={(e) => setSandbox(e.target.checked)} />
        Usar checkout sandbox
      </label>
      {proveedor === "mock" && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs text-warning sm:col-span-2">
          Mock genera cobros simulados y está bloqueado en producción salvo habilitación explícita del servidor.
        </p>
      )}
      <p className="text-xs text-muted-foreground sm:col-span-2">
        Los secretos se cifran en el servidor y nunca vuelven a mostrarse en el navegador.
      </p>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Boton disabled={guardando || !accessToken || !webhookSecret} onClick={guardar}>
          {guardando ? "Guardando…" : configurado ? "Reemplazar credenciales" : "Guardar credenciales"}
        </Boton>
        {configurado && <Boton variante="ghost" disabled={guardando} onClick={borrar}>Desactivar credenciales</Boton>}
      </div>
    </div>
  );
}
