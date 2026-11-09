"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Boton, Campo, Selector, tonoEstado } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { etiquetaPeriodicidad } from "@/lib/despacho";

type Opcion = { id: string; nombre: string };
type ProcesoCatalogo = { id: string; nombre: string; periodicidad: string; activo: boolean; actividades: { id: string; nombre: string }[] };
type Cliente = {
  id: string; rfc: string | null; notas: string | null; activo: boolean; version: number; responsableId: string | null;
  contacto: { id: string; nombre: string; telefono: string | null; email: string | null; empresa: string | null };
  procesos: { id: string; procesoId: string; responsableId: string | null; activo: boolean; proceso: { id: string; nombre: string; periodicidad: string } }[];
  actividades: { id: string; titulo: string; estado: string; fechaLimite: string; periodo: string }[];
};

export function DespachoClienteDetalle({
  inicial, procesos, usuarios, esGestion,
}: {
  inicial: Cliente;
  procesos: ProcesoCatalogo[];
  usuarios: Opcion[];
  esGestion: boolean;
}) {
  const [cliente, setCliente] = useState(inicial);
  const [form, setForm] = useState({ rfc: inicial.rfc ?? "", notas: inicial.notas ?? "", responsableId: inicial.responsableId ?? "", activo: inicial.activo });
  const [asignados, setAsignados] = useState(() => new Map(inicial.procesos.map((item) => [item.procesoId, item.responsableId ?? ""])));
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  function alternar(procesoId: string) {
    setAsignados((actual) => {
      const copia = new Map(actual);
      if (copia.has(procesoId)) copia.delete(procesoId); else copia.set(procesoId, "");
      return copia;
    });
  }

  function cambiarResponsable(procesoId: string, responsableId: string) {
    setAsignados((actual) => new Map(actual).set(procesoId, responsableId));
  }

  async function guardar(evento: React.FormEvent) {
    evento.preventDefault();
    setGuardando(true);
    setError("");
    const respuesta = await fetch(`/api/despacho/clientes/${cliente.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: cliente.version,
        rfc: form.rfc,
        notas: form.notas,
        responsableId: form.responsableId || null,
        activo: form.activo,
        procesos: [...asignados.entries()].map(([procesoId, responsableId]) => ({ procesoId, responsableId: responsableId || null })),
      }),
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) { setError(datos.error ?? "No se pudo guardar"); setGuardando(false); return; }
    setCliente(datos.cliente);
    setForm({ rfc: datos.cliente.rfc ?? "", notas: datos.cliente.notas ?? "", responsableId: datos.cliente.responsableId ?? "", activo: datos.cliente.activo });
    setAsignados(new Map(datos.cliente.procesos.map((item: Cliente["procesos"][number]) => [item.procesoId, item.responsableId ?? ""])));
    setGuardando(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/despacho/clientes" className="text-sm text-muted-foreground hover:text-foreground">← Clientes</Link>
          <h1 className="mt-1 text-2xl font-bold text-foreground">{cliente.contacto.empresa ?? cliente.contacto.nombre}</h1>
          <p className="text-sm text-muted-foreground">{cliente.contacto.nombre}{cliente.contacto.telefono ? ` · ${cliente.contacto.telefono}` : ""}{cliente.contacto.email ? ` · ${cliente.contacto.email}` : ""}</p>
        </div>
        <Badge tono={cliente.activo ? "success" : "neutral"}>{cliente.activo ? "Activo" : "Inactivo"}</Badge>
      </div>

      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={guardar} className="surface space-y-3 p-4 sm:p-5">
          <h2 className="font-semibold text-foreground">Datos del cliente</h2>
          <Campo label="RFC" value={form.rfc} maxLength={13} onChange={(e) => setForm({ ...form, rfc: e.target.value })} disabled={!esGestion} />
          <Selector label="Responsable" value={form.responsableId} onChange={(e) => setForm({ ...form, responsableId: e.target.value })} disabled={!esGestion}>
            <option value="">Sin asignar</option>
            {usuarios.map((usuario) => <option key={usuario.id} value={usuario.id}>{usuario.nombre}</option>)}
          </Selector>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-muted-foreground">Notas</span>
            <textarea className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/30" rows={4} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} disabled={!esGestion} />
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} disabled={!esGestion} />
            Cliente activo
          </label>
          {esGestion && <Boton type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Guardar cambios"}</Boton>}
        </form>

        <section className="surface space-y-3 p-4 sm:p-5">
          <h2 className="font-semibold text-foreground">Procesos asignados</h2>
          {procesos.length === 0 && <p className="text-sm text-muted-foreground">Aún no hay procesos en el catálogo.</p>}
          <div className="space-y-2">
            {procesos.filter((proceso) => proceso.activo).map((proceso) => {
              const activo = asignados.has(proceso.id);
              return (
                <div key={proceso.id} className="rounded-lg border border-border/70 p-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <input type="checkbox" checked={activo} onChange={() => alternar(proceso.id)} disabled={!esGestion} />
                    {proceso.nombre}
                    <span className="text-xs font-normal text-muted-foreground">({etiquetaPeriodicidad(proceso.periodicidad)})</span>
                  </label>
                  {activo && (
                    <div className="mt-2 pl-6">
                      <Selector label="Responsable del proceso" value={asignados.get(proceso.id) ?? ""} onChange={(e) => cambiarResponsable(proceso.id, e.target.value)} disabled={!esGestion}>
                        <option value="">Usar responsable del cliente</option>
                        {usuarios.map((usuario) => <option key={usuario.id} value={usuario.id}>{usuario.nombre}</option>)}
                      </Selector>
                      <p className="mt-1 text-xs text-muted-foreground">{proceso.actividades.length} actividad(es) en la plantilla</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Actividades recientes</h2>
        {cliente.actividades.length === 0 ? (
          <EmptyState titulo="Sin actividades" descripcion="Genera el mes desde Configuración para crear las actividades de sus procesos." />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-3 py-2">Actividad</th><th className="px-3 py-2">Periodo</th><th className="px-3 py-2">Límite</th><th className="px-3 py-2">Estado</th></tr>
              </thead>
              <tbody>
                {cliente.actividades.map((actividad) => (
                  <tr key={actividad.id} className="border-t border-border/60">
                    <td className="px-3 py-2 font-medium text-foreground">{actividad.titulo}</td>
                    <td className="px-3 py-2 text-muted-foreground">{actividad.periodo.slice(0, 10)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{actividad.fechaLimite.slice(0, 10)}</td>
                    <td className="px-3 py-2"><Badge tono={tonoEstado(actividad.estado)}>{actividad.estado.replaceAll("_", " ")}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
