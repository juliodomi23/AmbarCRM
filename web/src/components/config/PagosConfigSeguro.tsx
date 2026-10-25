"use client";

import { useEffect, useState } from "react";
import { Boton } from "@/components/ui";
import { toast } from "@/components/Toaster";

type EstadoCredencial = {
  proveedor: string;
  sandbox: boolean;
  configurado: boolean;
  usuarioProveedor: string | null;
  expiresAt: string | null;
  requiereReconexion: boolean;
};

export function PagosConfig({ modulo: _modulo }: { modulo: { config?: unknown } }) {
  const [credencial, setCredencial] = useState<EstadoCredencial | null>(null);
  const [cargando, setCargando] = useState(true);
  const [desconectando, setDesconectando] = useState(false);
  const [errorConfiguracion, setErrorConfiguracion] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const respuesta = await fetch("/api/pagos/credenciales");
        const datos = (await respuesta.json().catch(() => ({}))) as {
          credencial?: EstadoCredencial | null;
          error?: string;
          errorConfiguracion?: string | null;
        };
        if (!respuesta.ok)
          throw new Error(datos.error ?? "No se pudo consultar Mercado Pago");
        setCredencial(datos.credencial ?? null);
        setErrorConfiguracion(datos.errorConfiguracion ?? null);
      } catch (error) {
        setErrorConfiguracion(
          error instanceof Error
            ? error.message
            : "No se pudo consultar Mercado Pago",
        );
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  async function desconectar() {
    setDesconectando(true);
    try {
      const respuesta = await fetch("/api/pagos/credenciales", { method: "DELETE" });
      if (!respuesta.ok) return toast("No se pudo desconectar Mercado Pago", "error");
      setCredencial(null);
      toast("Mercado Pago fue desconectado");
    } catch {
      toast("No se pudo desconectar Mercado Pago. Revisa tu conexión.", "error");
    } finally {
      setDesconectando(false);
    }
  }

  const conectado = Boolean(credencial?.configurado && !credencial.requiereReconexion);
  const vencimiento = credencial?.expiresAt
    ? new Date(credencial.expiresAt).toLocaleDateString("es-MX", {
        dateStyle: "medium",
        timeZone: "America/Mexico_City",
      })
    : null;

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">Mercado Pago</p>
          <p className="text-xs text-muted-foreground">
            {cargando
              ? "Consultando conexión…"
              : conectado
                ? `Conectado como ${credencial?.usuarioProveedor ?? "cuenta autorizada"}`
                : credencial?.requiereReconexion
                  ? "La autorización venció o fue revocada"
                  : "Conecta la cuenta que recibirá los pagos de esta empresa"}
          </p>
          {vencimiento && conectado && (
            <p className="mt-1 text-xs text-muted-foreground">
              Token vigente hasta {vencimiento}; se renovará automáticamente.
            </p>
          )}
        </div>
        <span
          className={`rounded-full px-2 py-1 text-xs ${
            conectado ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
          }`}
        >
          {conectado ? "Conectado" : credencial?.requiereReconexion ? "Reconectar" : "Sin conexión"}
        </span>
      </div>

      {credencial?.proveedor === "mock" && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
          Mock genera cobros simulados y está bloqueado en producción salvo habilitación explícita.
        </p>
      )}

      {errorConfiguracion && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
          {errorConfiguracion}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        La autorización ocurre en Mercado Pago. AmbarCRM cifra los tokens y nunca los muestra en el navegador.
      </p>
      <div className="flex flex-wrap gap-2">
        <a
          href="/api/pagos/oauth/iniciar"
          className="inline-flex min-h-10 items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          {conectado ? "Reconectar Mercado Pago" : "Conectar Mercado Pago"}
        </a>
        {credencial?.configurado && (
          <Boton variante="ghost" disabled={desconectando} onClick={desconectar}>
            {desconectando ? "Desconectando…" : "Desconectar"}
          </Boton>
        )}
      </div>
    </div>
  );
}
