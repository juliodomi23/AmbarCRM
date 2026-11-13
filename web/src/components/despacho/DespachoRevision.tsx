"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/ui";
import { ConfirmarActividad, RechazarActividad } from "@/components/despacho/DespachoActividades";

type Actividad = {
  id: string; titulo: string; periodo: string; fechaLimite: string; version: number; notas: string | null;
  confirmadaAt: string | null;
  cliente: { contacto: { nombre: string; empresa: string | null } };
};

function pendientes(lista: Actividad[]) { return lista.filter((a) => !a.confirmadaAt); }

function fechaCorta(valor: string) {
  const fecha = valor.slice(0, 10);
  return new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");
}

function ContenidoTarjeta({ actividad, onConfirmar, onRechazar }: {
  actividad: Actividad;
  onConfirmar: (calificacion: number, nota: string) => Promise<void> | void;
  onRechazar: (motivo: string) => Promise<void> | void;
}) {
  return (
    <>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{actividad.cliente.contacto.empresa ?? actividad.cliente.contacto.nombre}</p>
        <h3 className="truncate font-semibold text-foreground">{actividad.titulo}</h3>
        <p className="text-xs text-muted-foreground">Vencía {fechaCorta(actividad.fechaLimite)}</p>
      </div>
      {actividad.notas && <p className="line-clamp-2 text-xs text-muted-foreground">{actividad.notas}</p>}
      <div className="space-y-2">
        <ConfirmarActividad onConfirmar={onConfirmar} />
        <RechazarActividad onRechazar={onRechazar} />
      </div>
    </>
  );
}

export function DespachoRevision({ iniciales }: { iniciales: Actividad[] }) {
  const [actividades, setActividades] = useState(pendientes(iniciales));
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const idModal = searchParams.get("actividad");
  const actividadModal = idModal ? actividades.find((a) => a.id === idModal) ?? null : null;
  const cerrarModal = () => router.replace("/despacho/revision");

  const cargar = useCallback(async () => {
    const respuesta = await fetch("/api/despacho/actividades?estado=completada", { cache: "no-store" });
    const datos = await respuesta.json().catch(() => ({}));
    if (respuesta.ok) setActividades(pendientes(datos.actividades));
  }, []);

  async function confirmar(actividad: Actividad, calificacion: number, nota: string) {
    const respuesta = await fetch(`/api/despacho/actividades/${actividad.id}/confirmar`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: actividad.version, calificacion, calificacionNota: nota }),
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) { setError(datos.error ?? "No se pudo confirmar la actividad"); void cargar(); return; }
    setActividades((lista) => lista.filter((item) => item.id !== actividad.id));
  }

  async function rechazar(actividad: Actividad, motivo: string) {
    const respuesta = await fetch(`/api/despacho/actividades/${actividad.id}/rechazar`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: actividad.version, motivo }),
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) { setError(datos.error ?? "No se pudo rechazar la actividad"); void cargar(); return; }
    setActividades((lista) => lista.filter((item) => item.id !== actividad.id));
  }

  useEffect(() => { void cargar(); }, [cargar]);

  return (
    <section className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {actividades.length === 0 ? (
        <EmptyState titulo="Nada por revisar" descripcion="Las actividades completadas que esperan confirmación aparecerán aquí." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {actividades.map((actividad) => (
            <article key={actividad.id} className="surface space-y-3 p-3">
              <ContenidoTarjeta actividad={actividad} onConfirmar={(calificacion, nota) => confirmar(actividad, calificacion, nota)} onRechazar={(motivo) => rechazar(actividad, motivo)} />
            </article>
          ))}
        </div>
      )}
      <Modal abierto={Boolean(actividadModal)} onClose={cerrarModal} titulo="Confirmar actividad">
        {actividadModal && (
          <div className="space-y-3">
            <ContenidoTarjeta actividad={actividadModal} onConfirmar={(calificacion, nota) => confirmar(actividadModal, calificacion, nota)} onRechazar={(motivo) => rechazar(actividadModal, motivo)} />
          </div>
        )}
      </Modal>
    </section>
  );
}
