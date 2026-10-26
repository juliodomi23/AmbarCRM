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
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
};

type ConfigRespuesta = { credenciales?: EstadoCredencial[]; proveedorPredeterminado?: string; erroresConfiguracion?: Record<string, string | null> };

export function PagosConfig({ modulo }: { modulo: { config?: unknown } }) {
  const [credenciales, setCredenciales] = useState<EstadoCredencial[]>([]);
  const [predeterminado, setPredeterminado] = useState("mercado_pago");
  const [cargando, setCargando] = useState(true);
  const [desconectando, setDesconectando] = useState<string | null>(null);
  const [erroresConfiguracion, setErroresConfiguracion] = useState<Record<string, string | null>>({});

  useEffect(() => {
    void (async () => {
      try {
        const respuesta = await fetch("/api/pagos/credenciales");
        const datos = (await respuesta.json().catch(() => ({}))) as {
          error?: string;
        } & ConfigRespuesta;
        if (!respuesta.ok)
          throw new Error(datos.error ?? "No se pudo consultar la configuración de pagos");
        setCredenciales(datos.credenciales ?? []);
        setPredeterminado(datos.proveedorPredeterminado ?? "mercado_pago");
        setErroresConfiguracion(datos.erroresConfiguracion ?? {});
      } catch (error) {
        const mensaje = error instanceof Error ? error.message : "No se pudo consultar la configuración de pagos";
        setErroresConfiguracion({ mercado_pago: mensaje, stripe: mensaje });
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  function credencial(proveedor: string) { return credenciales.find((item) => item.proveedor === proveedor); }

  async function desconectar(proveedor: string) {
    setDesconectando(proveedor);
    try {
      const respuesta = await fetch(`/api/pagos/credenciales?proveedor=${encodeURIComponent(proveedor)}`, { method: "DELETE" });
      if (!respuesta.ok) return toast(`No se pudo desconectar ${proveedor}`, "error");
      setCredenciales((actuales) => actuales.filter((item) => item.proveedor !== proveedor));
      toast(`${proveedor === "stripe" ? "Stripe" : "Mercado Pago"} fue desconectado de AmbarCRM`);
    } catch {
      toast("No se pudo desconectar el proveedor. Revisa tu conexión.", "error");
    } finally {
      setDesconectando(null);
    }
  }

  async function guardarPredeterminado(proveedor: string) {
    setPredeterminado(proveedor);
    const config = modulo.config && typeof modulo.config === "object" && !Array.isArray(modulo.config) ? modulo.config as Record<string, unknown> : {};
    try {
      const respuesta = await fetch("/api/modulos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clave: "pagos_en_linea", config: { ...config, proveedor } }) });
      if (!respuesta.ok) throw new Error();
      toast("Proveedor predeterminado actualizado");
    } catch {
      toast("No se pudo actualizar el proveedor predeterminado", "error");
    }
  }

  function tarjeta(proveedor: "mercado_pago" | "stripe") {
    const item = credencial(proveedor);
    const stripe = proveedor === "stripe";
    const listo = Boolean(item?.configurado && !item.requiereReconexion && (!stripe || item.chargesEnabled));
    const faltaContinuar = Boolean(stripe && item?.configurado && !item.chargesEnabled && !item.requiereReconexion);
    const nombre = stripe ? "Stripe" : "Mercado Pago";
    const error = erroresConfiguracion[proveedor];
    return <section key={proveedor} className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="font-medium">{nombre}</p><p className="text-xs text-muted-foreground">{cargando ? "Consultando conexión…" : listo ? `Conectado${item?.usuarioProveedor ? ` · ${item.usuarioProveedor}` : ""}` : faltaContinuar ? "Falta completar datos en Stripe" : item?.requiereReconexion ? "La conexión requiere atención" : "Sin conexión"}</p>
          {stripe && item?.configurado && <p className="mt-1 text-xs text-muted-foreground">{item.sandbox ? "Modo de prueba" : "Modo real"} · {item.detailsSubmitted ? "Datos enviados" : "Datos pendientes"}</p>}
        </div>
        <span className={`rounded-full px-2 py-1 text-xs ${listo ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>{listo ? "Listo para cobrar" : faltaContinuar ? "Incompleto" : item?.requiereReconexion ? "Reconectar" : "Sin conexión"}</span>
      </div>
      {error && <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">{error}</p>}
      {stripe && <p className="text-xs text-muted-foreground">Los cobros se depositan directamente en la cuenta conectada. La conexión crea una cuenta Standard nueva; conectar una cuenta Stripe existente queda pendiente.</p>}
      {!stripe && <p className="text-xs text-muted-foreground">La autorización se completa en Mercado Pago. AmbarCRM cifra los tokens y nunca los muestra en el navegador.</p>}
      <div className="flex flex-wrap gap-2">
        {(!stripe || (!cargando && !error)) && <a href={stripe ? "/api/pagos/stripe/iniciar" : "/api/pagos/oauth/iniciar"} className="inline-flex min-h-10 items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">{stripe ? faltaContinuar ? "Continuar onboarding de Stripe" : item?.configurado ? "Reconectar Stripe" : "Conectar Stripe" : item?.configurado ? "Reconectar Mercado Pago" : "Conectar Mercado Pago"}</a>}
        {item?.configurado && <Boton variante="ghost" disabled={desconectando === proveedor} onClick={() => void desconectar(proveedor)}>{desconectando === proveedor ? "Desconectando…" : "Desconectar"}</Boton>}
      </div>
    </section>;
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-border p-3">
      <label className="flex flex-wrap items-center gap-2 text-sm font-medium">Proveedor predeterminado
        <select value={predeterminado} onChange={(evento) => void guardarPredeterminado(evento.target.value)} className="rounded-md border border-input bg-background px-2 py-1">
          <option value="mercado_pago">Mercado Pago</option><option value="stripe">Stripe</option><option value="mock">Mock (pruebas)</option>
        </select>
      </label>
      <p className="text-xs text-muted-foreground">Los cobros existentes conservan su proveedor para webhooks y reembolsos.</p>
      {tarjeta("mercado_pago")}
      {tarjeta("stripe")}
    </div>
  );
}
