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

function fechaCorta(valor: string) {
  return new Date(valor).toLocaleDateString("es-MX", { day: "2-digit", month: "short", timeZone: "America/Mexico_City" });
}

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
  const [periodo, setPeriodo] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [creando, setCreando] = useState(false);
  const [form, setForm] = useState({ titulo: "", clienteId: "", periodo: "", fechaLimite: "", tipo: "extraordinaria", responsableId: "" });

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
        <Campo label="Periodo" type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
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

      {actividades.length === 0 ? (
        <EmptyState titulo={modo === "mias" ? "Sin actividades asignadas" : "Sin actividades"} descripcion="Cuando haya actividades para este filtro aparecerán aquí." />
      ) : (
        <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
          {actividades.map((actividad) => {
            const atrasada = estaAtrasada(actividad);
            const puede = esGestion || modo === "mias";
            const siguientes = ESTADOS_DESPACHO.filter((valor) => valor !== actividad.estado && transicionDespachoValida(actividad.estado, valor));
            return (
              <article key={actividad.id} className={`surface space-y-3 p-4 sm:p-5 ${atrasada ? "border-destructive/50" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs text-muted-foreground">{actividad.cliente.contacto.empresa ?? actividad.cliente.contacto.nombre}</p>
                    <h2 className="truncate font-semibold text-foreground">{actividad.titulo}</h2>
                  </div>
                  <Badge tono={tonoEstado(actividad.estado)} punto>{ETIQUETAS[actividad.estado] ?? actividad.estado}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Límite {fechaCorta(actividad.fechaLimite)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{actividad.tipo === "fija" ? "Fija" : "Extraordinaria"}</span>
                  {atrasada && <Badge tono="destructive">Atrasada</Badge>}
                </div>
                {actividad.notas && <p className="line-clamp-2 text-sm text-muted-foreground">{actividad.notas}</p>}
                {puede && siguientes.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {siguientes.map((siguiente) => (
                      <Boton key={siguiente} variante={siguiente === "completada" ? "primary" : "ghost"} className="!px-2.5 !py-1.5 !text-xs" onClick={() => void cambiar(actividad, siguiente)}>
                        {ETIQUETAS[siguiente]}
                      </Boton>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
