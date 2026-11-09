"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Boton, Campo, Selector, tonoEstado } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { ESTADOS_DESPACHO, estaAtrasada, transicionDespachoValida } from "@/lib/despacho";

type Actividad = {
  id: string; titulo: string; estado: string; tipo: string; periodo: string; fechaLimite: string;
  responsableId: string | null; notas: string | null; version: number;
  cliente: { id: string; contacto: { nombre: string; empresa: string | null } };
};

type Opcion = { id: string; nombre: string };
type Cliente = { id: string; contacto: { nombre: string; empresa: string | null } };

const ETIQUETAS: Record<string, string> = {
  pendiente: "Pendiente", en_proceso: "En proceso", completada: "Completada", bloqueada: "Bloqueada",
};
const COLUMNAS = [
  { estado: "pendiente", titulo: "Pendiente" },
  { estado: "en_proceso", titulo: "En proceso" },
  { estado: "bloqueada", titulo: "Bloqueada" },
  { estado: "completada", titulo: "Completada" },
];

function mesMexico() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit" }).format(new Date()); }
function moverMes(valor: string, delta: number) { const [anio, mes] = valor.split("-").map(Number); return new Date(Date.UTC(anio, mes - 1 + delta, 1)).toISOString().slice(0, 7); }
function etiquetaMes(valor: string) { return new Date(`${valor}-01T12:00:00Z`).toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }); }
function fechaCorta(valor: string) { const fecha = valor.slice(0, 10); return new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", ""); }
function avatar(nombre: string) { return nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((parte) => parte[0]).join("").toUpperCase() || "—"; }

export function DespachoActividades({
  iniciales, clientes, usuarios, esGestion, modo,
}: {
  iniciales: Actividad[];
  clientes: Cliente[];
  usuarios: Opcion[];
  esGestion: boolean;
  modo: "tablero" | "mias";
}) {
  const [actividades, setActividades] = useState(iniciales);
  const [estado, setEstado] = useState("");
  const [periodo, setPeriodo] = useState(mesMexico);
  const [clienteId, setClienteId] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [creando, setCreando] = useState(false);
  const [form, setForm] = useState({ titulo: "", clienteId: "", periodo: "", fechaLimite: "", tipo: "extraordinaria", responsableId: "" });
  const actividadesDelPeriodo = actividades.filter((actividad) => new Date(actividad.periodo).toISOString().slice(0, 7) === periodo);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    const params = new URLSearchParams();
    if (estado) params.set("estado", estado);
    if (periodo) params.set("periodo", periodo);
    if (clienteId) params.set("clienteId", clienteId);
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
  }, [estado, periodo, clienteId]);

  useEffect(() => { void cargar(); }, [cargar]);

  async function cambiar(actividad: Actividad, siguiente: string) {
    const respuesta = await fetch(`/api/despacho/actividades/${actividad.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: actividad.version, estado: siguiente }),
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) { setError(datos.error ?? "No se pudo actualizar"); if (respuesta.status === 409) void cargar(); return; }
    setActividades((lista) => lista.map((item) => item.id === actividad.id ? datos.actividad : item));
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
    setForm({ titulo: "", clienteId: "", periodo: "", fechaLimite: "", tipo: "extraordinaria", responsableId: "" });
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
        <Selector label="Cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
          <option value="">Todos</option>
          {clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.contacto.empresa ?? cliente.contacto.nombre}</option>)}
        </Selector>
        <Boton variante="ghost" onClick={() => void cargar()} disabled={cargando}>{cargando ? "Cargando…" : "Actualizar"}</Boton>
        {esGestion && <Boton onClick={() => setCreando((valor) => !valor)}>{creando ? "Cerrar" : "Nueva actividad"}</Boton>}
      </div>

      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      {creando && esGestion && (
        <form onSubmit={crear} className="surface grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
          <Campo label="Título" required value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
          <Selector label="Cliente" required value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value })}>
            <option value="">Selecciona…</option>
            {clientes.map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.contacto.empresa ?? cliente.contacto.nombre}</option>)}
          </Selector>
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
        <div className="hidden gap-3 sm:gap-4 md:grid md:grid-cols-2 xl:grid-cols-4">
          {COLUMNAS.map((columna) => {
            const delEstado = actividadesDelPeriodo.filter((actividad) => actividad.estado === columna.estado);
            return <section key={columna.estado} aria-labelledby={`columna-${columna.estado}`} className="space-y-3 rounded-xl bg-muted/30 p-3">
              <h2 id={`columna-${columna.estado}`} className="flex items-center justify-between gap-2 text-sm font-semibold text-foreground">{columna.titulo}<span className="rounded-full bg-card px-2 py-0.5 text-xs text-muted-foreground">{delEstado.length}</span></h2>
              {delEstado.map((actividad) => {
            const atrasada = estaAtrasada(actividad);
            const puede = esGestion || modo === "mias";
            const siguientes = ESTADOS_DESPACHO.filter((valor) => valor !== actividad.estado && transicionDespachoValida(actividad.estado, valor));
            const responsable = usuarios.find((usuario) => usuario.id === actividad.responsableId)?.nombre ?? "Sin asignar";
            return (
              <article key={actividad.id} aria-label={`${actividad.titulo}, ${ETIQUETAS[actividad.estado] ?? actividad.estado}`} className={`surface space-y-3 p-3 ${atrasada ? "border-destructive/50" : ""}`}>
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
                <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2"><Badge tono={actividad.estado === "bloqueada" ? "destructive" : tonoEstado(actividad.estado)} className={`min-h-7 px-2 text-xs ${actividad.estado === "bloqueada" ? "border border-destructive/30 bg-destructive/10 text-destructive" : ""}`}><span aria-hidden="true">{actividad.estado === "bloqueada" ? "!" : "•"}</span>{ETIQUETAS[actividad.estado] ?? actividad.estado}</Badge>{puede && siguientes.length > 0 && <select aria-label={`Cambiar estado de ${actividad.titulo}`} value={actividad.estado} onChange={(e) => void cambiar(actividad, e.target.value)} className="min-h-9 max-w-36 rounded-lg border border-input bg-card px-2 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{[actividad.estado, ...siguientes].map((siguiente) => <option key={siguiente} value={siguiente}>{siguiente === actividad.estado ? "Estado" : ETIQUETAS[siguiente]}</option>)}</select>}</div>
              </article>
            );
              })}
              {delEstado.length === 0 && <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">Sin actividades</p>}
            </section>;
          })}
        </div>
        <div className="space-y-2 md:hidden">{COLUMNAS.map((columna) => { const delEstado = actividadesDelPeriodo.filter((actividad) => actividad.estado === columna.estado); return <details key={`movil-${columna.estado}`} className="surface group"><summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{columna.titulo}<span className="text-sm text-muted-foreground">{delEstado.length}</span></summary><div className="space-y-3 p-3 pt-0">{delEstado.length ? delEstado.map((actividad) => { const atrasada = estaAtrasada(actividad); const responsable = usuarios.find((usuario) => usuario.id === actividad.responsableId)?.nombre ?? "Sin asignar"; const siguientes = ESTADOS_DESPACHO.filter((valor) => valor !== actividad.estado && transicionDespachoValida(actividad.estado, valor)); return <article key={actividad.id} className={`surface space-y-3 p-3 ${atrasada ? "border-destructive/50" : ""}`}><div><p className="text-xs text-muted-foreground">{actividad.cliente.contacto.empresa ?? actividad.cliente.contacto.nombre}</p><h3 className="font-semibold text-foreground">{actividad.titulo}</h3></div><div className="flex items-center justify-between text-xs"><span>{avatar(responsable)} · {responsable}</span><span className={atrasada ? "font-semibold text-destructive" : "text-muted-foreground"}>{atrasada ? "Atrasada · " : "Vence "}{fechaCorta(actividad.fechaLimite)}</span></div><div className="flex items-center justify-between"><Badge tono={actividad.estado === "bloqueada" ? "destructive" : tonoEstado(actividad.estado)} className={actividad.estado === "bloqueada" ? "border border-destructive/30 bg-destructive/10 text-destructive" : ""}><span aria-hidden="true">{actividad.estado === "bloqueada" ? "!" : "•"}</span>{ETIQUETAS[actividad.estado]}</Badge>{(esGestion || modo === "mias") && siguientes.length > 0 && <select aria-label={`Cambiar estado de ${actividad.titulo}`} value={actividad.estado} onChange={(e) => void cambiar(actividad, e.target.value)} className="min-h-9 rounded-lg border border-input bg-card px-2 text-xs text-foreground">{[actividad.estado, ...siguientes].map((siguiente) => <option key={siguiente} value={siguiente}>{siguiente === actividad.estado ? "Estado" : ETIQUETAS[siguiente]}</option>)}</select>}</div></article>; }) : <p className="pb-3 text-center text-xs text-muted-foreground">Sin actividades</p>}</div></details>; })}</div>
        </>
      )}
    </section>
  );
}
