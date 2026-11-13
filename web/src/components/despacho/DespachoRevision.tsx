"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { Boton, Modal } from "@/components/ui";
import { RechazarActividad } from "@/components/despacho/DespachoActividades";

type Actividad = {
  id: string; titulo: string; periodo: string; fechaLimite: string; version: number; notas: string | null;
  confirmadaAt: string | null; peso: number; responsableId: string | null;
  cliente: { contacto: { nombre: string; empresa: string | null } };
};
type Opcion = { id: string; nombre: string };

function pendientes(lista: Actividad[]) { return lista.filter((a) => !a.confirmadaAt); }

function fechaCorta(valor: string) {
  const fecha = valor.slice(0, 10);
  return new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");
}

function ConfirmarActividadPeso({ peso, onConfirmar }: { peso: number; onConfirmar: (calificacion: number, nota: string) => Promise<void> | void }) {
  const [abierto, setAbierto] = useState(false);
  const [calificacion, setCalificacion] = useState("");
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const valor = Number(calificacion);
  const valido = calificacion !== "" && Number.isInteger(valor) && valor >= 1 && valor <= peso;

  if (!abierto) {
    return <Boton className="min-h-9 w-full" onPointerDown={(e) => e.stopPropagation()} onClick={() => setAbierto(true)}>Confirmar actividad</Boton>;
  }

  return (
    <div className="space-y-2 rounded-lg border border-input bg-card p-2.5" onPointerDown={(e) => e.stopPropagation()}>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Calificación (de 1 a {peso})</span>
        <div className="flex items-center gap-1">
          <input
            type="number" min={1} max={peso} value={calificacion}
            onChange={(e) => setCalificacion(e.target.value)}
            className="w-16 rounded-md border border-input bg-card px-2 py-1 text-sm"
          />
          <span className="text-sm text-muted-foreground">/ {peso}</span>
        </div>
      </label>
      <textarea className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs" rows={2} placeholder="Comentario de calidad (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />
      <div className="flex gap-1.5">
        <Boton
          className="min-h-8 flex-1 text-xs"
          disabled={!valido || enviando}
          onClick={async () => { setEnviando(true); await onConfirmar(valor, nota); setEnviando(false); setAbierto(false); }}
        >
          {enviando ? "Confirmando…" : "Confirmar"}
        </Boton>
        <Boton variante="ghost" className="min-h-8 px-3 text-xs" onClick={() => { setAbierto(false); setCalificacion(""); setNota(""); }}>Cancelar</Boton>
      </div>
      {!valido && <p className="text-xs text-muted-foreground">Escribe una calificación entre 1 y {peso}.</p>}
    </div>
  );
}

function ContenidoTarjeta({ actividad, contador, onConfirmar, onRechazar }: {
  actividad: Actividad; contador: string;
  onConfirmar: (calificacion: number, nota: string) => Promise<void> | void;
  onRechazar: (motivo: string) => Promise<void> | void;
}) {
  return (
    <>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{actividad.cliente.contacto.empresa ?? actividad.cliente.contacto.nombre}</p>
        <h3 className="truncate font-semibold text-foreground">{actividad.titulo}</h3>
        <p className="text-xs text-muted-foreground">{contador} · Vencía {fechaCorta(actividad.fechaLimite)} · Valor {actividad.peso}</p>
      </div>
      {actividad.notas && <p className="line-clamp-2 text-xs text-muted-foreground">{actividad.notas}</p>}
      <div className="space-y-2">
        <ConfirmarActividadPeso peso={actividad.peso} onConfirmar={onConfirmar} />
        <RechazarActividad onRechazar={onRechazar} />
      </div>
    </>
  );
}

export function DespachoRevision({ iniciales, usuarios }: { iniciales: Actividad[]; usuarios: Opcion[] }) {
  const [actividades, setActividades] = useState(pendientes(iniciales));
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const idModal = searchParams.get("actividad");
  const actividadModal = idModal ? actividades.find((a) => a.id === idModal) ?? null : null;
  const cerrarModal = () => router.replace("/despacho/revision");
  const contador = (actividad: Actividad) => usuarios.find((u) => u.id === actividad.responsableId)?.nombre ?? "Sin asignar";

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
              <ContenidoTarjeta actividad={actividad} contador={contador(actividad)} onConfirmar={(calificacion, nota) => confirmar(actividad, calificacion, nota)} onRechazar={(motivo) => rechazar(actividad, motivo)} />
            </article>
          ))}
        </div>
      )}
      <Modal abierto={Boolean(actividadModal)} onClose={cerrarModal} titulo="Confirmar actividad">
        {actividadModal && (
          <div className="space-y-3">
            <ContenidoTarjeta actividad={actividadModal} contador={contador(actividadModal)} onConfirmar={(calificacion, nota) => confirmar(actividadModal, calificacion, nota)} onRechazar={(motivo) => rechazar(actividadModal, motivo)} />
          </div>
        )}
      </Modal>
    </section>
  );
}
