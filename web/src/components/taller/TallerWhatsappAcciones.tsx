"use client";

import { useState } from "react";
import { Boton } from "@/components/ui";
import { toast } from "@/components/Toaster";
import { TallerIcono } from "@/components/taller/TallerIcono";
import type { TipoNotificacionTaller } from "@/lib/taller-mensajes";

type Notificacion = {
  id: string;
  tipo: string;
  forma: string;
  estado: string;
  error: string | null;
  createdAt: string;
};

const TIPO: Record<string, string> = {
  aprobacion: "Liga de aprobación",
  listo: "Vehículo listo",
  estado: "Estado del servicio",
};

const FORMA: Record<string, string> = {
  oficial: "WhatsApp oficial",
  simulado: "Modo simulado",
  manual: "Enlace manual",
};

const ESTADO: Record<string, string> = {
  enviado: "Enviado",
  simulado: "Simulado",
  manual: "Listo para enviar",
  fallido: "Falló",
};

function horaFecha(valor: string) {
  return new Date(valor).toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Mexico_City",
  });
}

export function TallerWhatsappAcciones({
  ordenId,
  estado,
  aprobacionToken,
  notificaciones: iniciales,
}: {
  ordenId: string;
  estado: string;
  aprobacionToken: string | null;
  notificaciones: Notificacion[];
}) {
  const [notificaciones, setNotificaciones] = useState(iniciales);
  const [enviando, setEnviando] = useState<TipoNotificacionTaller | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [enlace, setEnlace] = useState("");

  async function enviar(tipo: TipoNotificacionTaller) {
    setEnviando(tipo);
    setEnlace("");
    try {
      const response = await fetch(`/api/taller/ordenes/${ordenId}/notificaciones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo }),
      });
      const datos = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(datos.error ?? "No se pudo enviar el aviso");
      setMensaje(String(datos.mensaje ?? ""));
      if (datos.enlaceWhatsapp) {
        setEnlace(String(datos.enlaceWhatsapp));
        window.open(String(datos.enlaceWhatsapp), "_blank", "noopener,noreferrer");
      }
      toast(
        datos.forma === "simulado"
          ? "Aviso simulado registrado. No se envió nada al cliente."
          : datos.forma === "manual"
            ? "Se preparó el mensaje en WhatsApp; confírmalo en la pestaña que se abrió."
            : "Aviso enviado al cliente por WhatsApp",
      );
      const refresco = await fetch(`/api/taller/ordenes/${ordenId}`, { cache: "no-store" });
      if (refresco.ok) {
        const data = await refresco.json();
        if (Array.isArray(data.orden?.notificaciones)) setNotificaciones(data.orden.notificaciones);
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "No se pudo enviar el aviso", "error");
    } finally {
      setEnviando(null);
    }
  }

  const puedeEstado = ["diagnostico", "esperando_aprobacion", "en_reparacion", "listo"].includes(estado);
  const puedeAprobacion = estado === "esperando_aprobacion" && Boolean(aprobacionToken);
  const puedeListo = estado === "listo";
  if (!puedeEstado && !puedeAprobacion && !puedeListo && !notificaciones.length) return null;

  return (
    <section className="surface space-y-4 p-4 sm:p-5" aria-label="Avisos por WhatsApp">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Avisos al cliente</p>
        <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold">
          <TallerIcono nombre="whatsapp" className="h-5 w-5 text-success" />
          WhatsApp del taller
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Se respeta lo configurado en el módulo: modo simulado, canal oficial o enlace manual. Un mismo aviso no se
          puede repetir antes de 10 minutos.
        </p>
      </div>

      {puedeListo && (
        <div className="rounded-xl border border-success/30 bg-success/10 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-success">
            <TallerIcono nombre="check" className="h-4 w-4" />
            El vehículo está listo
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Avisa al cliente para que pase por su vehículo y, si hay saldo, que lo conozca antes de llegar.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {puedeAprobacion && (
          <Boton className="min-h-11" disabled={enviando !== null} onClick={() => void enviar("aprobacion")}>
            <span className="inline-flex items-center gap-2">
              <TallerIcono nombre="whatsapp" className="h-4 w-4" />
              {enviando === "aprobacion" ? "Enviando…" : "Enviar liga por WhatsApp"}
            </span>
          </Boton>
        )}
        {puedeListo && (
          <Boton className="min-h-11" disabled={enviando !== null} onClick={() => void enviar("listo")}>
            <span className="inline-flex items-center gap-2">
              <TallerIcono nombre="whatsapp" className="h-4 w-4" />
              {enviando === "listo" ? "Enviando…" : "Avisar que está listo"}
            </span>
          </Boton>
        )}
        {puedeEstado && (
          <Boton
            className="min-h-11"
            variante="ghost"
            disabled={enviando !== null}
            onClick={() => void enviar("estado")}
          >
            <span className="inline-flex items-center gap-2">
              <TallerIcono nombre="reloj" className="h-4 w-4" />
              {enviando === "estado" ? "Enviando…" : "Enviar estado y seguimiento"}
            </span>
          </Boton>
        )}
      </div>

      {(mensaje || enlace) && (
        <div className="space-y-2 rounded-xl border border-border bg-muted/40 p-3" aria-live="polite">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {enlace ? "Revisa y envía el mensaje" : "Mensaje preparado"}
          </p>
          <p className="text-sm whitespace-pre-wrap">{mensaje}</p>
          {enlace && (
            <a
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-primary hover:bg-primary/5"
              href={enlace}
              target="_blank"
              rel="noreferrer"
            >
              <TallerIcono nombre="whatsapp" className="h-4 w-4" />
              Abrir WhatsApp
            </a>
          )}
        </div>
      )}

      {notificaciones.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Historial de avisos</h3>
          <ul className="divide-y divide-border/60">
            {notificaciones.slice(0, 8).map((notificacion) => (
              <li key={notificacion.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <span className="font-medium">{TIPO[notificacion.tipo] ?? notificacion.tipo}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {FORMA[notificacion.forma] ?? notificacion.forma}
                </span>
                <span
                  className={`text-xs font-semibold ${
                    notificacion.estado === "fallido" ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {ESTADO[notificacion.estado] ?? notificacion.estado}
                </span>
                <time className="ml-auto text-xs text-muted-foreground">{horaFecha(notificacion.createdAt)}</time>
                {notificacion.error && (
                  <p className="w-full text-xs text-destructive">{notificacion.error}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
