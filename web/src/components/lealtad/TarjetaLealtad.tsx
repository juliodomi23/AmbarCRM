"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/Toaster";

type Tarjeta = {
  nombre: string;
  sellos: number;
  premiosGanados: number;
  premiosPendientes: number;
};

type Estado =
  | { tipo: "oculto" }
  | { tipo: "cargando" }
  | { tipo: "error"; mensaje: string }
  | { tipo: "listo"; tarjeta: Tarjeta | null; ligaAlta: string };

/** Tarjeta de sellos de Aurum dentro del panel del contacto. No se muestra si el módulo está apagado. */
export function TarjetaLealtad({ contactoId }: { contactoId: string }) {
  const [estado, setEstado] = useState<Estado>({ tipo: "cargando" });
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const res = await fetch(`/api/lealtad/contacto/${contactoId}`);
    if (res.status === 404 || res.status === 403) return setEstado({ tipo: "oculto" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setEstado({ tipo: "error", mensaje: data.error ?? "No se pudo consultar Aurum" });
    if (!data.conectado) return setEstado({ tipo: "oculto" });
    setEstado({ tipo: "listo", tarjeta: data.tarjeta, ligaAlta: data.ligaAlta });
  }, [contactoId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function accion(tipo: "sellar" | "canjear") {
    setOcupado(true);
    const res = await fetch(`/api/lealtad/contacto/${contactoId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: tipo }),
    });
    const data = await res.json().catch(() => ({}));
    setOcupado(false);
    if (!res.ok) return toast(data.error ?? "No se pudo completar", "error");
    toast(
      tipo === "canjear"
        ? "Premio canjeado"
        : data.premiosNuevos?.length
          ? `Sello agregado · ganó: ${data.premiosNuevos.join(", ")}`
          : "Sello agregado",
    );
    void cargar();
  }

  async function copiarLiga(liga: string) {
    await navigator.clipboard.writeText(liga).catch(() => null);
    toast("Liga de alta copiada: pégala en el chat");
  }

  if (estado.tipo === "oculto") return null;

  return (
    <section className="space-y-2 rounded-lg border border-border p-3">
      <span className="text-xs font-medium uppercase text-muted-foreground">Tarjeta de lealtad</span>
      {estado.tipo === "cargando" && <p className="text-xs text-muted-foreground">Consultando Aurum…</p>}
      {estado.tipo === "error" && <p className="text-xs text-red-600">{estado.mensaje}</p>}
      {estado.tipo === "listo" && !estado.tarjeta && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Este contacto aún no tiene tarjeta.</p>
          <button
            type="button"
            onClick={() => copiarLiga(estado.ligaAlta)}
            className="text-xs font-medium text-primary"
          >
            Copiar liga para darse de alta
          </button>
        </div>
      )}
      {estado.tipo === "listo" && estado.tarjeta && (
        <div className="space-y-2">
          <div className="flex items-baseline gap-4 text-sm">
            <span>
              <b className="text-lg">{estado.tarjeta.sellos}</b> sellos
            </span>
            <span>
              <b className="text-lg">{estado.tarjeta.premiosPendientes}</b> premio(s) por canjear
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={ocupado}
              onClick={() => accion("sellar")}
              className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-60"
            >
              + Sellar
            </button>
            <button
              type="button"
              disabled={ocupado || estado.tarjeta.premiosPendientes === 0}
              onClick={() => accion("canjear")}
              className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium disabled:opacity-60"
            >
              Canjear premio
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
