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
    const disponible = Number(pago.monto) - Number(pago.montoReembolsado);
    const monto = window.prompt(
      `Monto a reembolsar (disponible ${disponible.toFixed(2)} ${pago.moneda})`,
      disponible.toFixed(2),
    );
    if (monto === null) return;
    setReembolsando(true);
    try {
      const respuesta = await fetch(`/api/pagos/${pago.id}/reembolso`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monto, idempotencyKey: `refund:${pago.id}:${crypto.randomUUID()}` }),
      });
      const datos = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) return toast(datos.error ?? "No se pudo reembolsar", "error");
      toast("Reembolso registrado");
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
    return (
      <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
        <span className="text-muted-foreground">
          {pago.proveedor === "mercado_pago" ? "Mercado Pago" : "Mock"} · {formatoMoneda(numeroMoneda(centavos(pago.monto) ?? 0n))}
          {reembolsado > 0 ? ` · reembolsado ${formatoMoneda(reembolsado)}` : ""}
        </span>
        <Badge tono={tonoEstado(pago.estado)} punto>
          {expirado && pago.estado === "pendiente" ? "Enlace expirado" : ETIQUETA[pago.estado] ?? pago.estado}
        </Badge>
        {pago.checkoutUrl && pago.estado === "pendiente" && !expirado && (
          <Boton variante="ghost" onClick={copiar}>
            Copiar enlace
          </Boton>
        )}
        {(["rechazado", "cancelado"].includes(pago.estado) || (pago.estado === "pendiente" && expirado)) && !["pagada", "cancelada"].includes(venta.estado) && (
          <Boton variante="ghost" disabled={creando} onClick={cobrar}>
            {creando ? "Generando…" : expirado ? "Regenerar enlace" : "Reintentar cobro"}
          </Boton>
        )}
        {puedeReembolsar && pago.estado === "aprobado" && Number(pago.montoReembolsado) < Number(pago.monto) && (
          <Boton variante="ghost" disabled={reembolsando} onClick={reembolsar}>
            {reembolsando ? "Reembolsando…" : "Reembolsar"}
          </Boton>
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
