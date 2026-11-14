"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { Badge, Boton, Modal, Selector } from "@/components/ui";
import { RechazarActividad } from "@/components/despacho/DespachoActividades";

type Actividad = {
  id: string; titulo: string; periodo: string; fechaLimite: string; version: number; notas: string | null;
  confirmadaAt: string | null; peso: number; responsableId: string | null;
  calificacion: number | null; calificacionNota: string | null;
  apelacionComentario: string | null; apelacionEstado: string | null; apelacionRespuesta: string | null;
  cliente: { contacto: { nombre: string; empresa: string | null } };
};
type Opcion = { id: string; nombre: string };
type Cliente = { id: string; contacto: { nombre: string; empresa: string | null } };

function pendientes(lista: Actividad[]) { return lista.filter((a) => !a.confirmadaAt); }

function fechaCorta(valor: string) {
  const fecha = valor.slice(0, 10);
  return new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");
}

function etiquetaMes(valor: string) {
  return new Date(`${valor.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });
}

function iniciales(nombre: string) {
  return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((parte) => parte[0]).join("").toUpperCase() || "—";
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
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-primary">{actividad.cliente.contacto.empresa ?? actividad.cliente.contacto.nombre}</p>
          <h3 className="truncate text-base font-semibold text-foreground">{actividad.titulo}</h3>
        </div>
        <Badge tono="warning" className="shrink-0"><span aria-hidden="true">◷</span>Por confirmar</Badge>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2.5 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary" title={contador} aria-label={`Contador: ${contador}`}>{iniciales(contador)}</span>
          <span className="truncate">{contador}</span>
        </span>
        <span className="shrink-0 capitalize">{etiquetaMes(actividad.periodo)}</span>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Vencía {fechaCorta(actividad.fechaLimite)}</span>
        <span className="font-medium text-foreground">Valor {actividad.peso}</span>
      </div>
      {actividad.notas && <p className="line-clamp-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">{actividad.notas}</p>}
      <div className="space-y-2 pt-1">
        <ConfirmarActividadPeso peso={actividad.peso} onConfirmar={onConfirmar} />
        <RechazarActividad onRechazar={onRechazar} />
      </div>
    </>
  );
}

function ResolverApelacion({ actividad, onResolver }: {
  actividad: Actividad;
  onResolver: (calificacion: number, nota: string, respuesta: string) => Promise<void> | void;
}) {
  const [calificacion, setCalificacion] = useState(String(actividad.calificacion ?? ""));
  const [nota, setNota] = useState(actividad.calificacionNota ?? "");
  const [respuesta, setRespuesta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const valor = Number(calificacion);
  const valido = calificacion !== "" && Number.isInteger(valor) && valor >= 1 && valor <= actividad.peso;

  return (
    <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/5 p-2.5">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-muted-foreground">Nueva calificación (de 1 a {actividad.peso})</span>
        <div className="flex items-center gap-1">
          <input type="number" min={1} max={actividad.peso} value={calificacion} onChange={(e) => setCalificacion(e.target.value)} className="w-16 rounded-md border border-input bg-card px-2 py-1 text-sm" />
          <span className="text-sm text-muted-foreground">/ {actividad.peso}</span>
        </div>
      </label>
      <textarea className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs" rows={2} placeholder="Nota de calidad (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />
      <textarea className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs" rows={2} placeholder="Respuesta al contador (opcional)" value={respuesta} onChange={(e) => setRespuesta(e.target.value)} />
      <div className="flex gap-1.5">
        <Boton className="min-h-8 flex-1 text-xs" disabled={!valido || enviando} onClick={async () => { setEnviando(true); await onResolver(valor, nota, respuesta); setEnviando(false); }}>
          {enviando ? "Resolviendo…" : "Resolver apelación"}
        </Boton>
      </div>
      {!valido && <p className="text-xs text-muted-foreground">Escribe una calificación entre 1 y {actividad.peso}.</p>}
    </div>
  );
}

function ApelacionTarjeta({ actividad, contador, onResolver }: {
  actividad: Actividad; contador: string;
  onResolver: (calificacion: number, nota: string, respuesta: string) => Promise<void> | void;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-primary">{actividad.cliente.contacto.empresa ?? actividad.cliente.contacto.nombre}</p>
          <h3 className="truncate text-base font-semibold text-foreground">{actividad.titulo}</h3>
        </div>
        <Badge tono="warning" className="shrink-0">Apelación</Badge>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2.5 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary" title={contador} aria-label={`Contador: ${contador}`}>{iniciales(contador)}</span>
          <span className="truncate">{contador}</span>
        </span>
        <span className="shrink-0">Calificación: {actividad.calificacion}/{actividad.peso}</span>
      </div>
      <p className="rounded-md border border-warning/30 bg-warning/10 px-2 py-1.5 text-xs text-foreground">
        <span className="font-semibold">Motivo del contador: </span>{actividad.apelacionComentario}
      </p>
      {actividad.calificacionNota && <p className="text-xs text-muted-foreground">Nota original: {actividad.calificacionNota}</p>}
      <ResolverApelacion actividad={actividad} onResolver={onResolver} />
    </>
  );
}

export function DespachoRevision({ iniciales, apelacionesIniciales = [], usuarios, clientes }: { iniciales: Actividad[]; apelacionesIniciales?: Actividad[]; usuarios: Opcion[]; clientes: Cliente[] }) {
  const [actividades, setActividades] = useState(pendientes(iniciales));
  const [apelaciones, setApelaciones] = useState(apelacionesIniciales);
  const [error, setError] = useState("");
  const [responsableIdFiltro, setResponsableIdFiltro] = useState("");
  const [clienteIdFiltro, setClienteIdFiltro] = useState("");
  const [periodoFiltro, setPeriodoFiltro] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const idModal = searchParams.get("actividad");
  const actividadModal = idModal ? actividades.find((a) => a.id === idModal) ?? null : null;
  const idApelacion = searchParams.get("apelacion");
  const apelacionModal = idApelacion ? apelaciones.find((a) => a.id === idApelacion) ?? null : null;
  const cerrarModal = () => router.replace("/despacho/revision");
  const contador = (actividad: Actividad) => usuarios.find((u) => u.id === actividad.responsableId)?.nombre ?? "Sin asignar";

  const cargar = useCallback(async () => {
    const params = new URLSearchParams({ estado: "completada" });
    if (responsableIdFiltro) params.set("responsableId", responsableIdFiltro);
    if (clienteIdFiltro) params.set("clienteId", clienteIdFiltro);
    if (periodoFiltro) params.set("periodo", periodoFiltro);
    const respuesta = await fetch(`/api/despacho/actividades?${params}`, { cache: "no-store" });
    const datos = await respuesta.json().catch(() => ({}));
    if (respuesta.ok) setActividades(pendientes(datos.actividades));
  }, [responsableIdFiltro, clienteIdFiltro, periodoFiltro]);

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

  const cargarApelaciones = useCallback(async () => {
    const respuesta = await fetch("/api/despacho/actividades?apelacion=pendiente", { cache: "no-store" });
    const datos = await respuesta.json().catch(() => ({}));
    if (respuesta.ok) setApelaciones(datos.actividades ?? []);
  }, []);

  async function resolver(actividad: Actividad, calificacion: number, nota: string, respuesta: string) {
    const solicitud = await fetch(`/api/despacho/actividades/${actividad.id}/resolver-apelacion`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: actividad.version, calificacion, calificacionNota: nota, respuesta }),
    });
    const datos = await solicitud.json().catch(() => ({}));
    if (!solicitud.ok) { setError(datos.error ?? "No se pudo resolver la apelación"); void cargarApelaciones(); return; }
    setApelaciones((lista) => lista.filter((item) => item.id !== actividad.id));
  }

  useEffect(() => {
    void cargar();
    void cargarApelaciones();
    const timer = window.setInterval(() => { void cargar(); void cargarApelaciones(); }, 30000);
    window.addEventListener("focus", cargar);
    window.addEventListener("focus", cargarApelaciones);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", cargar);
      window.removeEventListener("focus", cargarApelaciones);
    };
  }, [cargar, cargarApelaciones]);

  return (
    <section className="space-y-4">
      <div className="surface flex flex-wrap items-end gap-3 p-4 sm:p-5">
        <Selector label="Contador" value={responsableIdFiltro} onChange={(e) => setResponsableIdFiltro(e.target.value)}>
          <option value="">Todos</option>
          {usuarios.map((usuario) => <option key={usuario.id} value={usuario.id}>{usuario.nombre}</option>)}
        </Selector>
        <Selector label="Cliente" value={clienteIdFiltro} onChange={(e) => setClienteIdFiltro(e.target.value)}>
          <option value="">Todos</option>
          {clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.contacto.empresa ?? cliente.contacto.nombre}</option>)}
        </Selector>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted-foreground">Periodo</span>
          <input type="month" value={periodoFiltro} onChange={(e) => setPeriodoFiltro(e.target.value)} className="min-h-10 rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground" />
        </label>
        {(responsableIdFiltro || clienteIdFiltro || periodoFiltro) && (
          <Boton variante="ghost" className="min-h-10 text-sm" onClick={() => { setResponsableIdFiltro(""); setClienteIdFiltro(""); setPeriodoFiltro(""); }}>Limpiar filtros</Boton>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {apelaciones.length > 0 && (
        <section className="space-y-3">
          <div><h2 className="text-lg font-semibold text-foreground">Apelaciones por resolver</h2><p className="text-sm text-muted-foreground">El contador no está de acuerdo con la calificación. Ajusta la calificación y responde.</p></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {apelaciones.map((actividad) => (
              <article key={actividad.id} className="surface space-y-3 border-l-4 border-l-warning p-4">
                <ApelacionTarjeta actividad={actividad} contador={contador(actividad)} onResolver={(calificacion, nota, respuesta) => resolver(actividad, calificacion, nota, respuesta)} />
              </article>
            ))}
          </div>
        </section>
      )}
      {actividades.length === 0 ? (
        <EmptyState titulo="Nada por revisar" descripcion="Las actividades completadas que esperan confirmación aparecerán aquí." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {actividades.map((actividad) => (
            <article key={actividad.id} className="surface space-y-3 border-l-4 border-l-warning/60 p-4">
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
      <Modal abierto={Boolean(apelacionModal)} onClose={cerrarModal} titulo="Resolver apelación">
        {apelacionModal && (
          <div className="space-y-3">
            <ApelacionTarjeta actividad={apelacionModal} contador={contador(apelacionModal)} onResolver={(calificacion, nota, respuesta) => resolver(apelacionModal, calificacion, nota, respuesta)} />
          </div>
        )}
      </Modal>
    </section>
  );
}
