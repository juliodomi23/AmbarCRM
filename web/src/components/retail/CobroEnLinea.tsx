"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/Toaster";
import { Badge, Boton, formatoMoneda, tonoEstado } from "@/components/ui";
import type { VentaRetail } from "@/components/retail/tipos";
import { centavos, numeroMoneda } from "@/lib/retail-calculos";

const ETIQUETA: Record<string, string> = {
  pendiente: "Pago pendiente",
  aprobado: "Pago aprobado",
  rechazado: "Pago rechazado",
  cancelado: "Pago cancelado",
  reembolsado: "Pago reembolsado",
};

export function CobroEnLinea({
  venta,
  puedeReembolsar = false,
}: {
  venta: VentaRetail;
  puedeReembolsar?: boolean;
}) {
  const router = useRouter();
  const [creando, setCreando] = useState(false);
  const [reembolsando, setReembolsando] = useState(false);
  const [mostrandoReembolso, setMostrandoReembolso] = useState(false);
  const [montoReembolso, setMontoReembolso] = useState("");
  const [idempotencyReembolso, setIdempotencyReembolso] = useState("");
  const [limiteReembolso, setLimiteReembolso] = useState(0);
  const pago = venta.pagoOnline;

  async function cobrar() {
    const ventana = window.open("about:blank", "_blank");
    setCreando(true);
    try {
      const respuesta = await fetch("/api/pagos/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origenTipo: "venta",
          origenId: venta.id,
          idempotencyKey: `venta:${venta.id}:${crypto.randomUUID()}`,
        }),
      });
      const datos = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok || !datos.url) {
        ventana?.close();
        return toast(datos.error ?? "No se pudo crear el enlace", "error");
      }
      if (ventana) ventana.location.href = datos.url;
      else window.location.href = datos.url;
      router.refresh();
    } catch {
      ventana?.close();
      toast("No se pudo crear el enlace. Revisa tu conexión.", "error");
    } finally {
      setCreando(false);
    }
  }

  async function reembolsar() {
    if (!pago) return;
    const monto = montoReembolso.trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(monto) || Number(monto) <= 0)
      return toast("Escribe un monto positivo con máximo 2 decimales", "error");
    if (Number(monto) > limiteReembolso)
      return toast("El monto supera el disponible para reembolso", "error");
    const clave =
      idempotencyReembolso || `refund:${pago.id}:${crypto.randomUUID()}`;
    if (!idempotencyReembolso) setIdempotencyReembolso(clave);
    setReembolsando(true);
    try {
      const respuesta = await fetch(`/api/pagos/${pago.id}/reembolso`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monto, idempotencyKey: clave }),
      });
      const datos = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) return toast(datos.error ?? "No se pudo reembolsar", "error");
      const estado = datos.resultado?.estado;
      if (estado === "aprobado") {
        toast("Reembolso aprobado");
        setMostrandoReembolso(false);
        setMontoReembolso("");
        setIdempotencyReembolso("");
        setLimiteReembolso(0);
      } else if (estado === "pendiente") {
        toast("Reembolso en proceso");
      } else if (estado === "rechazado") {
        toast("El proveedor rechazó el reembolso", "error");
        setIdempotencyReembolso("");
      } else {
        toast("No se pudo confirmar el estado del reembolso", "error");
      }
      router.refresh();
    } catch {
      toast("No se pudo solicitar el reembolso", "error");
    } finally {
      setReembolsando(false);
    }
  }

  async function copiar() {
    if (!pago?.checkoutUrl) return;
    await navigator.clipboard.writeText(pago.checkoutUrl);
    toast("Enlace de pago copiado");
  }

  if (pago) {
    const expirado = pago.expiraAt ? new Date(pago.expiraAt) <= new Date() : false;
    const reembolsado = numeroMoneda(centavos(pago.montoReembolsado) ?? 0n);
    const pendiente = numeroMoneda(centavos(pago.montoPendienteReembolso) ?? 0n);
    const total = numeroMoneda(centavos(pago.monto) ?? 0n);
    const disponible = Math.max(0, total - reembolsado - pendiente);
    const metadata =
      pago.metadata && typeof pago.metadata === "object" && !Array.isArray(pago.metadata)
        ? (pago.metadata as Record<string, unknown>)
        : {};
    const enRevision = Boolean(
      metadata.requiereReembolso || metadata.conflicto || metadata.contracargo,
    );
    return (
      <div className="space-y-2 text-xs">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-muted-foreground">
            {pago.proveedor === "mercado_pago" ? "Mercado Pago" : "Mock"} · Reembolsado {formatoMoneda(reembolsado)} de {formatoMoneda(total)}
          </span>
          <Badge tono={enRevision ? "warning" : tonoEstado(pago.estado)} punto>
            {enRevision
              ? "Pago en revisión / requiere reembolso"
              : expirado && pago.estado === "pendiente"
                ? "Enlace expirado"
                : ETIQUETA[pago.estado] ?? pago.estado}
          </Badge>
          {enRevision && typeof metadata.motivoConflicto === "string" && (
            <span className="max-w-sm text-warning">{metadata.motivoConflicto}</span>
          )}
          {pago.checkoutUrl && pago.estado === "pendiente" && !expirado && (
            <Boton variante="ghost" onClick={copiar}>Copiar enlace</Boton>
          )}
          {(["rechazado", "cancelado"].includes(pago.estado) || (pago.estado === "pendiente" && expirado)) && !["pagada", "cancelada"].includes(venta.estado) && (
            <Boton variante="ghost" disabled={creando} onClick={cobrar}>
              {creando ? "Generando…" : expirado ? "Regenerar enlace" : "Reintentar cobro"}
            </Boton>
          )}
          {puedeReembolsar && pago.estado === "aprobado" && disponible > 0 && !mostrandoReembolso && (
            <Boton
              variante="ghost"
              onClick={() => {
                setMontoReembolso(disponible.toFixed(2));
                setLimiteReembolso(disponible);
                setIdempotencyReembolso(`refund:${pago.id}:${crypto.randomUUID()}`);
                setMostrandoReembolso(true);
              }}
            >
              Reembolsar
            </Boton>
          )}
        </div>
        {mostrandoReembolso && (
          <div className="flex flex-wrap items-end justify-end gap-2">
            <label className="grid gap-1 text-muted-foreground">
              Monto a reembolsar (disponible {formatoMoneda(disponible)})
              <input
                type="number"
                min="0.01"
                max={disponible.toFixed(2)}
                step="0.01"
                value={montoReembolso}
                onChange={(evento) => setMontoReembolso(evento.target.value)}
                className="h-10 w-44 rounded-lg border border-border bg-background px-3 text-foreground"
              />
            </label>
            <Boton variante="ghost" disabled={reembolsando} onClick={reembolsar}>
              {reembolsando ? "Reembolsando…" : "Confirmar reembolso"}
            </Boton>
            <Boton
              variante="ghost"
              disabled={reembolsando}
              onClick={() => {
                setMostrandoReembolso(false);
                setIdempotencyReembolso("");
                setLimiteReembolso(0);
              }}
            >
              Cancelar
            </Boton>
          </div>
        )}
      </div>
    );
  }
  if (["pagada", "cancelada"].includes(venta.estado)) return null;
  return (
    <Boton variante="ghost" disabled={creando} onClick={cobrar}>
      {creando ? "Creando enlace…" : "Cobrar en línea"}
    </Boton>
  );
}
