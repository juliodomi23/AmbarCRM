"use client";

import { useState } from "react";
import { Badge, Boton, Campo, Selector } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { PERIODICIDADES, etiquetaPeriodicidad } from "@/lib/despacho";

type ActividadPlantilla = { id?: string; nombre: string; diaLimite: number; activo?: boolean };
type Proceso = { id: string; nombre: string; periodicidad: string; activo: boolean; actividades: ActividadPlantilla[]; _count?: { clientes: number } };

const VACIA: ActividadPlantilla = { nombre: "", diaLimite: 1 };

export function DespachoConfiguracion({ iniciales, esGestion }: { iniciales: Proceso[]; esGestion: boolean }) {
  const [procesos, setProcesos] = useState(iniciales);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [creando, setCreando] = useState(false);
  const [nuevo, setNuevo] = useState<{ nombre: string; periodicidad: string; actividades: ActividadPlantilla[] }>({ nombre: "", periodicidad: "mensual", actividades: [{ ...VACIA }] });

  async function crear(evento: React.FormEvent) {
    evento.preventDefault();
    setError("");
    const respuesta = await fetch("/api/despacho/procesos", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...nuevo, actividades: nuevo.actividades.filter((actividad) => actividad.nombre.trim()) }),
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) { setError(datos.error ?? "No se pudo crear el proceso"); return; }
    setProcesos((lista) => [datos.proceso, ...lista]);
    setNuevo({ nombre: "", periodicidad: "mensual", actividades: [{ ...VACIA }] });
    setCreando(false);
  }

  async function guardar(proceso: Proceso) {
    setError("");
    const respuesta = await fetch(`/api/despacho/procesos/${proceso.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: proceso.nombre, periodicidad: proceso.periodicidad, activo: proceso.activo, actividades: proceso.actividades }),
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) { setError(datos.error ?? "No se pudo guardar el proceso"); return; }
    setProcesos((lista) => lista.map((item) => item.id === proceso.id ? datos.proceso : item));
    setAviso("Proceso guardado");
  }

  async function generar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(""); setAviso("");
    const respuesta = await fetch("/api/despacho/generar", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mes }),
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) { setError(datos.error ?? "No se pudo generar el mes"); return; }
    setAviso(`Mes ${datos.mes}: ${datos.creadas} actividades creadas, ${datos.existentes} ya existían.`);
  }

  function actualizar(id: string, cambios: Partial<Proceso>) {
    setProcesos((lista) => lista.map((proceso) => proceso.id === id ? { ...proceso, ...cambios } : proceso));
  }

  function actualizarActividad(id: string, indice: number, cambios: Partial<ActividadPlantilla>) {
    setProcesos((lista) => lista.map((proceso) => proceso.id === id
      ? { ...proceso, actividades: proceso.actividades.map((actividad, i) => i === indice ? { ...actividad, ...cambios } : actividad) }
      : proceso));
  }

  return (
    <div className="space-y-5">
      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {aviso && <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{aviso}</p>}

      {esGestion && (
        <form onSubmit={generar} className="surface flex flex-wrap items-end gap-3 p-4 sm:p-5">
          <Campo label="Generar actividades del mes" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
          <Boton type="submit">Generar</Boton>
          <p className="w-full text-xs text-muted-foreground">No duplica actividades ya generadas para el mismo cliente y plantilla.</p>
        </form>
      )}

      {esGestion && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Procesos</h2>
            <Boton variante="ghost" onClick={() => setCreando((valor) => !valor)}>{creando ? "Cerrar" : "Nuevo proceso"}</Boton>
          </div>
          {creando && (
            <form onSubmit={crear} className="surface space-y-3 p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo label="Nombre del proceso" required value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
                <Selector label="Periodicidad" value={nuevo.periodicidad} onChange={(e) => setNuevo({ ...nuevo, periodicidad: e.target.value })}>
                  {PERIODICIDADES.map((valor) => <option key={valor} value={valor}>{etiquetaPeriodicidad(valor)}</option>)}
                </Selector>
              </div>
              <div className="space-y-2">
                {nuevo.actividades.map((actividad, indice) => (
                  <div key={indice} className="flex flex-wrap items-end gap-2">
                    <Campo label="Actividad" value={actividad.nombre} onChange={(e) => setNuevo({ ...nuevo, actividades: nuevo.actividades.map((item, i) => i === indice ? { ...item, nombre: e.target.value } : item) })} />
                    <Campo label="Día límite" type="number" min={1} max={31} value={actividad.diaLimite} onChange={(e) => setNuevo({ ...nuevo, actividades: nuevo.actividades.map((item, i) => i === indice ? { ...item, diaLimite: Number(e.target.value) } : item) })} />
                    <Boton type="button" variante="ghost" onClick={() => setNuevo({ ...nuevo, actividades: nuevo.actividades.filter((_, i) => i !== indice) })}>Quitar</Boton>
                  </div>
                ))}
                <Boton type="button" variante="ghost" onClick={() => setNuevo({ ...nuevo, actividades: [...nuevo.actividades, { ...VACIA }] })}>Agregar actividad</Boton>
              </div>
              <Boton type="submit">Crear proceso</Boton>
            </form>
          )}
        </section>
      )}

      {procesos.length === 0 ? (
        <EmptyState titulo="Sin procesos" descripcion="Crea el primer proceso con sus actividades y día límite." />
      ) : (
        <div className="space-y-3">
          {procesos.map((proceso) => (
            <article key={proceso.id} className="surface space-y-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-end gap-3">
                <Campo label="Proceso" value={proceso.nombre} onChange={(e) => actualizar(proceso.id, { nombre: e.target.value })} disabled={!esGestion} />
                <Selector label="Periodicidad" value={proceso.periodicidad} onChange={(e) => actualizar(proceso.id, { periodicidad: e.target.value })} disabled={!esGestion}>
                  {PERIODICIDADES.map((valor) => <option key={valor} value={valor}>{etiquetaPeriodicidad(valor)}</option>)}
                </Selector>
                <Badge tono={proceso.activo ? "success" : "neutral"}>{proceso.activo ? "Activo" : "Inactivo"}</Badge>
              </div>
              <div className="space-y-2">
                {proceso.actividades.map((actividad, indice) => (
                  <div key={actividad.id ?? indice} className="flex flex-wrap items-end gap-2">
                    <Campo label="Actividad" value={actividad.nombre} onChange={(e) => actualizarActividad(proceso.id, indice, { nombre: e.target.value })} disabled={!esGestion} />
                    <Campo label="Día límite" type="number" min={1} max={31} value={actividad.diaLimite} onChange={(e) => actualizarActividad(proceso.id, indice, { diaLimite: Number(e.target.value) })} disabled={!esGestion} />
                    {esGestion && <Boton variante="ghost" onClick={() => actualizar(proceso.id, { actividades: proceso.actividades.filter((_, i) => i !== indice) })}>Quitar</Boton>}
                  </div>
                ))}
              </div>
              {esGestion && (
                <div className="flex flex-wrap gap-2">
                  <Boton variante="ghost" onClick={() => actualizar(proceso.id, { actividades: [...proceso.actividades, { ...VACIA }] })}>Agregar actividad</Boton>
                  <Boton onClick={() => void guardar(proceso)}>Guardar</Boton>
                  <Boton variante="danger" onClick={() => { actualizar(proceso.id, { activo: false }); void guardar({ ...proceso, activo: false }); }}>Desactivar</Boton>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
