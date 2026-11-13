"use client";

import { useCallback, useEffect, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { Badge, Boton, Campo, Selector, tonoEstado } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { ESTADOS_DESPACHO, actividadCuentaComoCompletada, estaAtrasada, transicionDespachoValida } from "@/lib/despacho";

type Actividad = {
  id: string; titulo: string; estado: string; tipo: string; periodo: string; fechaLimite: string;
  responsableId: string | null; notas: string | null; version: number; requiereConfirmacion: boolean;
  confirmadaAt: string | null; confirmadaPorId: string | null;
  calificacion: number | null; calificacionNota: string | null;
  cliente: { id: string; contacto: { nombre: string; empresa: string | null } };
};

type Opcion = { id: string; nombre: string };
type Cliente = { id: string; contacto: { nombre: string; empresa: string | null } };

const ETIQUETAS: Record<string, string> = {
  pendiente: "Pendiente", en_proceso: "En proceso", por_confirmar: "Por confirmar", completada: "Completada", bloqueada: "Bloqueada",
};
const COLUMNAS = [
  { estado: "pendiente", titulo: "Pendiente" },
  { estado: "en_proceso", titulo: "En proceso" },
  { estado: "bloqueada", titulo: "Bloqueada" },
  { estado: "por_confirmar", titulo: "Por confirmar" },
  { estado: "completada", titulo: "Completada" },
];

function esperaConfirmacion(actividad: Actividad) {
  return actividad.estado === "completada" && !actividadCuentaComoCompletada(actividad);
}

function vaEnColumna(actividad: Actividad, estado: string) {
  if (estado === "por_confirmar") return esperaConfirmacion(actividad);
  if (estado === "completada") return actividadCuentaComoCompletada(actividad);
  return actividad.estado === estado;
}

function mesMexico() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit" }).format(new Date()); }
function moverMes(valor: string, delta: number) { const [anio, mes] = valor.split("-").map(Number); return new Date(Date.UTC(anio, mes - 1 + delta, 1)).toISOString().slice(0, 7); }
function etiquetaMes(valor: string) { return new Date(`${valor}-01T12:00:00Z`).toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }); }
function fechaCorta(valor: string) { const fecha = valor.slice(0, 10); return new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", ""); }
function avatar(nombre: string) { return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((parte) => parte[0]).join("").toUpperCase() || "—"; }

function EstrellaCalificacion({ valor, activo, onClick }: { valor: number; activo: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-label={`Calidad ${valor} de 5`} aria-pressed={activo} onPointerDown={(e) => e.stopPropagation()} onClick={onClick} className="grid h-8 w-8 place-items-center rounded-md text-warning transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill={activo ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 2.5l2.9 6.1 6.6.9-4.8 4.7 1.1 6.6L12 17.6l-5.8 3.2 1.1-6.6-4.8-4.7 6.6-.9z" />
      </svg>
    </button>
  );
}

export function ConfirmarActividad({ onConfirmar }: { onConfirmar: (calificacion: number, nota: string) => Promise<void> | void }) {
  const [abierto, setAbierto] = useState(false);
  const [calificacion, setCalificacion] = useState(0);
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (!abierto) {
    return <Boton className="min-h-9 w-full" onPointerDown={(e) => e.stopPropagation()} onClick={() => setAbierto(true)}>Confirmar actividad</Boton>;
  }

  return (
    <div className="space-y-2 rounded-lg border border-input bg-card p-2.5" onPointerDown={(e) => e.stopPropagation()}>
      <p className="text-xs font-medium text-muted-foreground">Calidad del trabajo</p>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((valor) => (
          <EstrellaCalificacion key={valor} valor={valor} activo={valor <= calificacion} onClick={() => setCalificacion(valor)} />
        ))}
      </div>
      <textarea className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs" rows={2} placeholder="Comentario de calidad (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />
      <div className="flex gap-1.5">
        <Boton
          className="min-h-8 flex-1 text-xs"
          disabled={calificacion === 0 || enviando}
          onClick={async () => { setEnviando(true); await onConfirmar(calificacion, nota); setEnviando(false); setAbierto(false); }}
        >
          {enviando ? "Confirmando…" : "Confirmar"}
        </Boton>
        <Boton variante="ghost" className="min-h-8 px-3 text-xs" onClick={() => { setAbierto(false); setCalificacion(0); setNota(""); }}>Cancelar</Boton>
      </div>
      {calificacion === 0 && <p className="text-xs text-muted-foreground">Elige una calificación de calidad para confirmar.</p>}
    </div>
  );
}

export function RechazarActividad({ onRechazar }: { onRechazar: (motivo: string) => Promise<void> | void }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (!abierto) {
    return <Boton variante="ghost" className="min-h-9 w-full text-destructive" onPointerDown={(e) => e.stopPropagation()} onClick={() => setAbierto(true)}>Rechazar</Boton>;
  }

  return (
    <div className="space-y-2 rounded-lg border border-input bg-card p-2.5" onPointerDown={(e) => e.stopPropagation()}>
      <p className="text-xs font-medium text-muted-foreground">Motivo del rechazo</p>
      <textarea className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs" rows={2} placeholder="¿Qué hay que corregir?" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      <div className="flex gap-1.5">
        <Boton
          variante="ghost"
          className="min-h-8 flex-1 text-xs text-destructive"
          disabled={!motivo.trim() || enviando}
          onClick={async () => { setEnviando(true); await onRechazar(motivo.trim()); setEnviando(false); setAbierto(false); }}
        >
          {enviando ? "Rechazando…" : "Confirmar rechazo"}
        </Boton>
        <Boton variante="ghost" className="min-h-8 px-3 text-xs" onClick={() => { setAbierto(false); setMotivo(""); }}>Cancelar</Boton>
      </div>
      {!motivo.trim() && <p className="text-xs text-muted-foreground">Escribe el motivo para poder rechazar.</p>}
    </div>
  );
}

function TarjetaVista({ actividad, puede, puedeConfirmar, responsable, siguientes, onCambiar, onConfirmar, onRechazar }: {
  actividad: Actividad; puede: boolean; puedeConfirmar: boolean; responsable: string; siguientes: string[];
  onCambiar: (siguiente: string) => void; onConfirmar: (calificacion: number, nota: string) => Promise<void> | void;
  onRechazar: (motivo: string) => Promise<void> | void;
}) {
  const atrasada = estaAtrasada(actividad);
  const pendienteConfirmacion = esperaConfirmacion(actividad);
  return (
    <article aria-label={`${actividad.titulo}, ${ETIQUETAS[actividad.estado] ?? actividad.estado}`} className={`surface space-y-3 p-3 ${atrasada ? "border-destructive/50" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{actividad.cliente.contacto.empresa ?? actividad.cliente.contacto.nombre}</p>
          <h3 className="truncate font-semibold text-foreground">{actividad.titulo}</h3>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-2"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary" title={responsable} aria-label={`Responsable: ${responsable}`}>{avatar(responsable)}</span><span className="truncate">{responsable}</span></span>
        <span className={atrasada ? "shrink-0 font-semibold text-destructive" : "shrink-0"}>{atrasada ? "Atrasada · " : "Vence "}{fechaCorta(actividad.fechaLimite)}</span>
      </div>
      {actividad.notas && <p className="line-clamp-2 text-xs text-muted-foreground">{actividad.notas}</p>}
      <div className="flex items-center gap-2 border-t border-border/60 pt-2">
        <Badge tono={actividad.estado === "bloqueada" ? "destructive" : pendienteConfirmacion ? "warning" : tonoEstado(actividad.estado)} className={`min-h-7 px-2 text-xs ${actividad.estado === "bloqueada" ? "border border-destructive/30 bg-destructive/10 text-destructive" : ""}`}><span aria-hidden="true">{actividad.estado === "bloqueada" ? "!" : pendienteConfirmacion ? "◷" : "•"}</span>{pendienteConfirmacion ? "Por confirmar" : ETIQUETAS[actividad.estado] ?? actividad.estado}</Badge>
      </div>
      {pendienteConfirmacion && <p className="text-xs text-warning">No suma al avance hasta que se confirme.</p>}
      {pendienteConfirmacion && puedeConfirmar && (
        <div className="space-y-2">
          <ConfirmarActividad onConfirmar={onConfirmar} />
          <RechazarActividad onRechazar={onRechazar} />
        </div>
      )}
      {actividad.calificacion && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground" title={actividad.calificacionNota ?? undefined}>
          <span>Calidad:</span>
          <span className="flex gap-0.5 text-warning">
            {[1, 2, 3, 4, 5].map((valor) => (
              <svg key={valor} viewBox="0 0 24 24" className="h-3.5 w-3.5" fill={valor <= actividad.calificacion! ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 2.5l2.9 6.1 6.6.9-4.8 4.7 1.1 6.6L12 17.6l-5.8 3.2 1.1-6.6-4.8-4.7 6.6-.9z" />
              </svg>
            ))}
          </span>
        </div>
      )}
      {puede && siguientes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {siguientes.map((siguiente) => (
            <button key={siguiente} type="button" aria-label={`Mover ${actividad.titulo} a ${ETIQUETAS[siguiente]}`} onPointerDown={(e) => e.stopPropagation()} onClick={() => onCambiar(siguiente)} className="rounded-md border border-input bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              → {ETIQUETAS[siguiente]}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}

function TarjetaArrastrable({ actividad, puede, puedeConfirmar, responsable, siguientes, onCambiar, onConfirmar, onRechazar }: {
  actividad: Actividad; puede: boolean; puedeConfirmar: boolean; responsable: string; siguientes: string[];
  onCambiar: (siguiente: string) => void; onConfirmar: (calificacion: number, nota: string) => Promise<void> | void;
  onRechazar: (motivo: string) => Promise<void> | void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: actividad.id, disabled: !puede });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} style={{ opacity: isDragging ? 0.4 : 1 }} className={puede ? "cursor-grab touch-none active:cursor-grabbing" : undefined}>
      <TarjetaVista actividad={actividad} puede={puede} puedeConfirmar={puedeConfirmar} responsable={responsable} siguientes={siguientes} onCambiar={onCambiar} onConfirmar={onConfirmar} onRechazar={onRechazar} />
    </div>
  );
}

function ColumnaKanban({ columna, conteo, children }: { columna: { estado: string; titulo: string }; conteo: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: columna.estado, disabled: columna.estado === "por_confirmar" });
  return (
    <section ref={setNodeRef} aria-labelledby={`columna-${columna.estado}`} className={`space-y-3 rounded-xl p-3 transition-colors ${isOver ? "bg-primary/10 ring-2 ring-primary/40" : "bg-muted/30"}`}>
      <h2 id={`columna-${columna.estado}`} className="flex items-center justify-between gap-2 text-sm font-semibold text-foreground">{columna.titulo}<span className="rounded-full bg-card px-2 py-0.5 text-xs text-muted-foreground">{conteo}</span></h2>
      {children}
    </section>
  );
}

export function DespachoActividades({
  iniciales, clientes, usuarios, esGestion, puedeConfirmar = false, modo, clienteIdInicial = "", soloCliente = false, periodoInicial, responsableIdInicial = "",
}: {
  iniciales: Actividad[];
  clientes: Cliente[];
  usuarios: Opcion[];
  esGestion: boolean;
  puedeConfirmar?: boolean;
  modo: "tablero" | "mias";
  clienteIdInicial?: string;
  soloCliente?: boolean;
  periodoInicial?: string;
  responsableIdInicial?: string;
}) {
  const [actividades, setActividades] = useState(iniciales);
  const [estado, setEstado] = useState("");
  const [periodo, setPeriodo] = useState(periodoInicial ?? mesMexico);
  const [clienteId, setClienteId] = useState(clienteIdInicial);
  const [responsableIdFiltro, setResponsableIdFiltro] = useState(responsableIdInicial);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [creando, setCreando] = useState(false);
  const [form, setForm] = useState({ titulo: "", clienteId: clienteIdInicial, periodo: "", fechaLimite: "", tipo: "extraordinaria", responsableId: "" });
  const [arrastrando, setArrastrando] = useState<Actividad | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const actividadesDelPeriodo = actividades.filter((actividad) => new Date(actividad.periodo).toISOString().slice(0, 7) === periodo);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    const params = new URLSearchParams();
    if (estado) params.set("estado", estado);
    if (periodo) params.set("periodo", periodo);
    if (clienteId) params.set("clienteId", clienteId);
    if (responsableIdFiltro) params.set("responsableId", responsableIdFiltro);
    try {
      const respuesta = await fetch(`/api/despacho/actividades?${params}`, { cache: "no-store" });
      const datos = await respuesta.json();
      if (!respuesta.ok) throw new Error(datos.error ?? "No se pudieron cargar las actividades");
      setActividades(datos.actividades);
    } catch (fallo) {
      setError(fallo instanceof Error ? fallo.message : "Error al cargar");
    } finally {
      setCargando(false);
    }
  }, [estado, periodo, clienteId, responsableIdFiltro]);

  useEffect(() => {
    void cargar();
    const timer = window.setInterval(cargar, 30000);
    window.addEventListener("focus", cargar);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", cargar);
    };
  }, [cargar]);

  async function cambiar(actividad: Actividad, siguiente: string) {
    const respuesta = await fetch(`/api/despacho/actividades/${actividad.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: actividad.version, estado: siguiente }),
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) { setError(datos.error ?? "No se pudo actualizar"); if (respuesta.status === 409) void cargar(); return; }
    setActividades((lista) => lista.map((item) => item.id === actividad.id ? datos.actividad : item));
  }

  async function confirmar(actividad: Actividad, calificacion: number, nota: string) {
    const respuesta = await fetch(`/api/despacho/actividades/${actividad.id}/confirmar`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: actividad.version, calificacion, calificacionNota: nota }),
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) { setError(datos.error ?? "No se pudo confirmar la actividad"); if (respuesta.status === 409) void cargar(); return; }
    setActividades((lista) => lista.map((item) => item.id === actividad.id ? datos.actividad : item));
  }

  async function rechazar(actividad: Actividad, motivo: string) {
    const respuesta = await fetch(`/api/despacho/actividades/${actividad.id}/rechazar`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: actividad.version, motivo }),
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) { setError(datos.error ?? "No se pudo rechazar la actividad"); if (respuesta.status === 409) void cargar(); return; }
    setActividades((lista) => lista.map((item) => item.id === actividad.id ? datos.actividad : item));
  }

  function onDragStart(evento: DragStartEvent) {
    setArrastrando(actividadesDelPeriodo.find((actividad) => actividad.id === evento.active.id) ?? null);
  }

  function onDragEnd(evento: DragEndEvent) {
    setArrastrando(null);
    const { active, over } = evento;
    if (!over) return;
    const actividad = actividadesDelPeriodo.find((item) => item.id === active.id);
    const destino = String(over.id);
    if (!actividad || actividad.estado === destino) return;
    if (!transicionDespachoValida(actividad.estado, destino)) { setError("Esa actividad no puede pasar directo a esa columna."); return; }
    void cambiar(actividad, destino);
  }

  async function crear(evento: React.FormEvent) {
    evento.preventDefault();
    const respuesta = await fetch("/api/despacho/actividades", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) { setError(datos.error ?? "No se pudo crear la actividad"); return; }
    setActividades((lista) => [datos.actividad, ...lista]);
    setCreando(false);
    setForm({ titulo: "", clienteId: clienteIdInicial, periodo: "", fechaLimite: "", tipo: "extraordinaria", responsableId: "" });
  }

  return (
    <section className="space-y-4">
      <div className="surface flex flex-wrap items-end gap-3 p-4 sm:p-5">
        <Selector label="Estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Todos</option>
          {ESTADOS_DESPACHO.map((valor) => <option key={valor} value={valor}>{ETIQUETAS[valor]}</option>)}
        </Selector>
        <div className="space-y-1">
          <span className="block text-sm font-medium text-muted-foreground">Periodo</span>
          <div className="flex min-h-10 items-center rounded-lg border border-input bg-card p-0.5">
            <button type="button" aria-label="Mes anterior" onClick={() => setPeriodo((valor) => moverMes(valor, -1))} className="grid h-9 w-9 place-items-center rounded-md text-xl text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">‹</button>
            <span className="min-w-32 text-center text-sm font-medium capitalize text-foreground">{etiquetaMes(periodo)}</span>
            <button type="button" aria-label="Mes siguiente" onClick={() => setPeriodo((valor) => moverMes(valor, 1))} className="grid h-9 w-9 place-items-center rounded-md text-xl text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">›</button>
          </div>
        </div>
        {!soloCliente && <Selector label="Cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
          <option value="">Todos</option>
          {clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.contacto.empresa ?? cliente.contacto.nombre}</option>)}
        </Selector>}
        {esGestion && (
          <Selector label="Colaborador" value={responsableIdFiltro} onChange={(e) => setResponsableIdFiltro(e.target.value)}>
            <option value="">Todos</option>
            {usuarios.map((usuario) => <option key={usuario.id} value={usuario.id}>{usuario.nombre}</option>)}
          </Selector>
        )}
        <Boton variante="ghost" onClick={() => void cargar()} disabled={cargando}>{cargando ? "Cargando…" : "Actualizar"}</Boton>
        {esGestion && <Boton onClick={() => setCreando((valor) => !valor)}>{creando ? "Cerrar" : "Nueva actividad"}</Boton>}
      </div>

      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      {creando && esGestion && (
        <form onSubmit={crear} className="surface grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
          <Campo label="Título" required value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
          {!soloCliente && <Selector label="Cliente" required value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value })}>
            <option value="">Selecciona…</option>
            {clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.contacto.empresa ?? cliente.contacto.nombre}</option>)}
          </Selector>}
          <Campo label="Periodo" type="month" required value={form.periodo} onChange={(e) => setForm({ ...form, periodo: e.target.value })} />
          <Campo label="Fecha límite" type="date" required value={form.fechaLimite} onChange={(e) => setForm({ ...form, fechaLimite: e.target.value })} />
          <Selector label="Tipo" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
            <option value="extraordinaria">Extraordinaria</option>
            <option value="fija">Fija</option>
          </Selector>
          <Selector label="Responsable" value={form.responsableId} onChange={(e) => setForm({ ...form, responsableId: e.target.value })}>
            <option value="">Sin asignar</option>
            {usuarios.map((usuario) => <option key={usuario.id} value={usuario.id}>{usuario.nombre}</option>)}
          </Selector>
          <div className="sm:col-span-2 lg:col-span-3"><Boton type="submit">Guardar actividad</Boton></div>
        </form>
      )}

      {actividadesDelPeriodo.length === 0 ? (
        <EmptyState titulo={modo === "mias" ? "Sin actividades asignadas" : "Sin actividades"} descripcion="Cuando haya actividades para este filtro aparecerán aquí." />
      ) : (
        <>
        <DndContext id="kanban-despacho" sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="hidden gap-3 sm:gap-4 md:grid md:grid-cols-2 xl:grid-cols-5">
            {COLUMNAS.map((columna) => {
              const delEstado = actividadesDelPeriodo.filter((actividad) => vaEnColumna(actividad, columna.estado));
              return (
                <ColumnaKanban key={columna.estado} columna={columna} conteo={delEstado.length}>
                  {delEstado.map((actividad) => {
                    const puede = esGestion || modo === "mias";
                    const siguientes = ESTADOS_DESPACHO.filter((valor) => valor !== actividad.estado && transicionDespachoValida(actividad.estado, valor));
                    const responsable = usuarios.find((usuario) => usuario.id === actividad.responsableId)?.nombre ?? "Sin asignar";
                    return (
                      <TarjetaArrastrable key={actividad.id} actividad={actividad} puede={puede} puedeConfirmar={puedeConfirmar} responsable={responsable} siguientes={siguientes} onCambiar={(siguiente) => void cambiar(actividad, siguiente)} onConfirmar={(calificacion, nota) => confirmar(actividad, calificacion, nota)} onRechazar={(motivo) => rechazar(actividad, motivo)} />
                    );
                  })}
                  {delEstado.length === 0 && <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">Sin actividades</p>}
                </ColumnaKanban>
              );
            })}
          </div>
          <DragOverlay>{arrastrando ? <div className="w-64"><TarjetaVista actividad={arrastrando} puede={false} puedeConfirmar={false} responsable={usuarios.find((usuario) => usuario.id === arrastrando!.responsableId)?.nombre ?? "Sin asignar"} siguientes={[]} onCambiar={() => {}} onConfirmar={() => {}} onRechazar={() => {}} /></div> : null}</DragOverlay>
        </DndContext>
        <div className="space-y-2 md:hidden">{COLUMNAS.map((columna) => { const delEstado = actividadesDelPeriodo.filter((actividad) => vaEnColumna(actividad, columna.estado)); return <details key={`movil-${columna.estado}`} className="surface group"><summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{columna.titulo}<span className="text-sm text-muted-foreground">{delEstado.length}</span></summary><div className="space-y-3 p-3 pt-0">{delEstado.length ? delEstado.map((actividad) => { const responsable = usuarios.find((usuario) => usuario.id === actividad.responsableId)?.nombre ?? "Sin asignar"; const siguientes = ESTADOS_DESPACHO.filter((valor) => valor !== actividad.estado && transicionDespachoValida(actividad.estado, valor)); return <TarjetaVista key={actividad.id} actividad={actividad} puede={esGestion || modo === "mias"} puedeConfirmar={puedeConfirmar} responsable={responsable} siguientes={siguientes} onCambiar={(siguiente) => void cambiar(actividad, siguiente)} onConfirmar={(calificacion, nota) => confirmar(actividad, calificacion, nota)} onRechazar={(motivo) => rechazar(actividad, motivo)} />; }) : <p className="pb-3 text-center text-xs text-muted-foreground">Sin actividades</p>}</div></details>; })}</div>
        </>
      )}
    </section>
  );
}
