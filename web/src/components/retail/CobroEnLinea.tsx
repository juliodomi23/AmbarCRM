"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/Toaster";
import { Badge, Boton, tonoEstado } from "@/components/ui";
import type { VentaRetail } from "@/components/retail/tipos";

const ETIQUETA: Record<string, string> = {
  pendiente: "Pago pendiente",
  aprobado: "Pago aprobado",
  rechazado: "Pago rechazado",
  cancelado: "Pago cancelado",
  reembolsado: "Pago reembolsado",
};

export function CobroEnLinea({ venta }: { venta: VentaRetail }) {
  const router = useRouter();
  const [creando, setCreando] = useState(false);
  const pago = venta.pagoOnline;

  async function cobrar() {
    setCreando(true);
    try {
      const respuesta = await fetch("/api/pagos/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origenTipo: "venta",
          origenId: venta.id,
          idempotencyKey: `venta:${venta.id}:${String(venta.total)}`,
        }),
      });
      const datos = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok || !datos.url)
        return toast(datos.error ?? "No se pudo crear el enlace", "error");
      window.open(datos.url, "_blank", "noopener,noreferrer");
      router.refresh();
    } catch {
      toast("No se pudo crear el enlace. Revisa tu conexión.", "error");
    } finally {
      setCreando(false);
    }
  }

  async function copiar() {
    if (!pago?.checkoutUrl) return;
    await navigator.clipboard.writeText(pago.checkoutUrl);
    toast("Enlace de pago copiado");
  }

  if (pago) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge tono={tonoEstado(pago.estado)} punto>
          {ETIQUETA[pago.estado] ?? pago.estado}
        </Badge>
        {pago.checkoutUrl && pago.estado === "pendiente" && (
          <Boton variante="ghost" onClick={copiar}>
            Copiar enlace
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
