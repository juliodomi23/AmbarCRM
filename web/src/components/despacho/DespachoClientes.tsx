"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Boton, Campo, Selector } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { actividadCuentaComoCompletada } from "@/lib/despacho";

type Cliente = {
  id: string; rfc: string | null; activo: boolean; version: number; responsableId: string | null;
  contacto: { id: string; nombre: string; telefono: string | null; empresa: string | null };
  procesos: { id: string; proceso: { id: string; nombre: string; periodicidad: string } }[];
  _count: { actividades: number };
  actividades: { estado: string; fechaLimite: string; requiereConfirmacion: boolean; confirmadaAt: string | null }[];
};
type Opcion = { id: string; nombre: string };

function actividadAtrasada(actividad: Cliente["actividades"][number]) {
  const fecha = new Date(`${actividad.fechaLimite.slice(0, 10)}T23:59:59-06:00`);
  return actividad.estado !== "completada" && fecha < new Date();
}

export function DespachoClientes({
  iniciales, contactos, usuarios, esGestion,
}: {
  iniciales: Cliente[];
  contactos: Opcion[];
  usuarios: Opcion[];
  esGestion: boolean;
}) {
  const [clientes, setClientes] = useState(iniciales);
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState("atrasadas");
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ contactoId: "", rfc: "", responsableId: "" });

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLocaleLowerCase("es-MX");
    const filtrados = !texto ? clientes : clientes.filter((cliente) =>
      [cliente.contacto.nombre, cliente.contacto.empresa, cliente.rfc].some((valor) => valor?.toLocaleLowerCase("es-MX").includes(texto)),
    );
    return [...filtrados].sort((a, b) => {
      const atrasadasA = a.actividades.filter(actividadAtrasada).length;
      const atrasadasB = b.actividades.filter(actividadAtrasada).length;
      const porcentajeA = a.actividades.length ? a.actividades.filter(actividadCuentaComoCompletada).length / a.actividades.length : 0;
      const porcentajeB = b.actividades.length ? b.actividades.filter(actividadCuentaComoCompletada).length / b.actividades.length : 0;
      return orden === "avance" ? porcentajeA - porcentajeB : atrasadasB - atrasadasA || porcentajeA - porcentajeB;
    });
  }, [clientes, busqueda, orden]);

  async function crear(evento: React.FormEvent) {
    evento.preventDefault();
    setError("");
    const respuesta = await fetch("/api/despacho/clientes", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) { setError(datos.error ?? "No se pudo crear el cliente"); return; }
    setClientes((lista) => [{ ...datos.cliente, procesos: datos.cliente.procesos ?? [], _count: { actividades: 0 }, actividades: [] }, ...lista]);
    setCreando(false);
    setForm({ contactoId: "", rfc: "", responsableId: "" });
  }

  return (
    <section className="space-y-4">
      <div className="surface flex flex-wrap items-end gap-3 p-4 sm:p-5">
        <label className="min-w-56 flex-1 space-y-1">
          <span className="text-sm font-medium text-muted-foreground">Buscar</span>
          <input className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/30" placeholder="Nombre, empresa o RFC" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </label>
        <Selector label="Ordenar por" value={orden} onChange={(e) => setOrden(e.target.value)}><option value="atrasadas">Atrasadas primero</option><option value="avance">Menor avance primero</option></Selector>
        {esGestion && <Boton onClick={() => setCreando((valor) => !valor)}>{creando ? "Cerrar" : "Nuevo cliente"}</Boton>}
      </div>

      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      {creando && esGestion && (
        <form onSubmit={crear} className="surface grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
          <Selector label="Contacto" required value={form.contactoId} onChange={(e) => setForm({ ...form, contactoId: e.target.value })}>
            <option value="">Selecciona…</option>
            {contactos.map((contacto) => <option key={contacto.id} value={contacto.id}>{contacto.nombre}</option>)}
          </Selector>
          <Campo label="RFC" value={form.rfc} onChange={(e) => setForm({ ...form, rfc: e.target.value })} maxLength={13} />
          <Selector label="Responsable" value={form.responsableId} onChange={(e) => setForm({ ...form, responsableId: e.target.value })}>
            <option value="">Sin asignar</option>
            {usuarios.map((usuario) => <option key={usuario.id} value={usuario.id}>{usuario.nombre}</option>)}
          </Selector>
          <div className="sm:col-span-2 lg:col-span-3"><Boton type="submit">Guardar cliente</Boton></div>
        </form>
      )}

      {visibles.length === 0 ? (
        <EmptyState titulo="Sin clientes de despacho" descripcion="Agrega un cliente existente de tu CRM para empezar a asignarle procesos." />
      ) : (
        <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibles.map((cliente) => (
            <Link key={cliente.id} href={`/despacho/clientes/${cliente.id}`} className="surface surface-interactiva group space-y-3 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold text-foreground">{cliente.contacto.empresa ?? cliente.contacto.nombre}</h2>
                  {((cliente.contacto.empresa && cliente.contacto.nombre !== cliente.contacto.empresa) || cliente.rfc) && <p className="truncate text-xs text-muted-foreground">{cliente.contacto.empresa && cliente.contacto.nombre !== cliente.contacto.empresa ? cliente.contacto.nombre : ""}{cliente.rfc ? `${cliente.contacto.empresa && cliente.contacto.nombre !== cliente.contacto.empresa ? " · " : ""}${cliente.rfc}` : ""}</p>}
                </div>
                <Badge tono={cliente.activo ? "success" : "neutral"}>{cliente.activo ? "Activo" : "Inactivo"}</Badge>
              </div>
              {(() => { const hechas = cliente.actividades.filter(actividadCuentaComoCompletada).length; const avance = cliente.actividades.length ? Math.round(hechas / cliente.actividades.length * 100) : null; const atrasadas = cliente.actividades.filter(actividadAtrasada).length; const responsable = usuarios.find((usuario) => usuario.id === cliente.responsableId)?.nombre ?? "Sin asignar"; const avatar = responsable.split(/\s+/).filter(Boolean).slice(0, 2).map((parte) => parte[0]).join("").toUpperCase() || "—"; return <>
                <div className="space-y-1.5"><div className="flex items-center justify-between text-xs"><span className="font-medium text-muted-foreground">Avance del mes</span><span className="font-semibold text-foreground">{avance === null ? "Sin actividades" : `${avance}%`}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={avance ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label={`Avance del mes ${avance ?? 0} por ciento`}><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${avance ?? 0}%` }} /></div></div>
                <div className="flex items-center justify-between gap-3 text-xs"><span className="flex min-w-0 items-center gap-2 text-muted-foreground"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 font-semibold text-primary" title={responsable} aria-label={`Responsable: ${responsable}`}>{avatar}</span><span className="truncate">{responsable}</span></span><span className={atrasadas ? "font-semibold text-destructive" : "text-muted-foreground"}>{atrasadas} atrasada{atrasadas === 1 ? "" : "s"}</span></div>
                <p className="text-xs text-muted-foreground">{cliente.procesos.length} procesos · {cliente._count.actividades} actividades</p>
              </>; })()}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
