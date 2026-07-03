"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, Campo, Modal } from "@/components/ui";
import { toast } from "@/components/Toaster";
import { EtiquetaNueva } from "@/components/EtiquetaNueva";

type Etiqueta = { id: string; nombre: string; color: string };
type Contacto = {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  empresa: string | null;
  fuente: string;
  responsableId: string | null;
  responsable: string | null;
  optOutDifusion: boolean;
  oportunidades: number;
  etiquetas: Etiqueta[];
};

const FORM_VACIO = { nombre: "", telefono: "", email: "", empresa: "", fuente: "manual", responsableId: "", optOutDifusion: false };

export function ContactosCliente({
  contactos,
  etiquetas,
  usuarios
}: {
  contactos: Contacto[];
  etiquetas: Etiqueta[];
  usuarios: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [filtroEtiqueta, setFiltroEtiqueta] = useState("");
  const [filtroResponsable, setFiltroResponsable] = useState("");
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Contacto | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [importando, setImportando] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null);

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return contactos.filter((c) => {
      if (q && !(
        c.nombre.toLowerCase().includes(q) ||
        (c.telefono ?? "").includes(q) ||
        (c.empresa ?? "").toLowerCase().includes(q)
      )) return false;
      if (filtroEtiqueta && !c.etiquetas.some((e) => e.id === filtroEtiqueta)) return false;
      if (filtroResponsable === "sin" && c.responsableId) return false;
      if (filtroResponsable && filtroResponsable !== "sin" && c.responsableId !== filtroResponsable) return false;
      return true;
    });
  }, [contactos, busqueda, filtroEtiqueta, filtroResponsable]);

  async function importarCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportando(true);
    const csv = await file.text();
    const res = await fetch("/api/contactos/importar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv })
    });
    setImportando(false);
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      toast(`Importación lista: ${d.creados} nuevos · ${d.actualizados} actualizados · ${d.omitidos} omitidos`);
      router.refresh();
    } else {
      toast(d.error ?? "No se pudo importar", "error");
    }
  }

  function abrirNuevo() {
    setEditando(null);
    setForm(FORM_VACIO);
    setModal(true);
  }
  function abrirEditar(c: Contacto) {
    setEditando(c);
    setForm({
      nombre: c.nombre,
      telefono: c.telefono ?? "",
      email: c.email ?? "",
      empresa: c.empresa ?? "",
      fuente: c.fuente,
      responsableId: c.responsableId ?? "",
      optOutDifusion: c.optOutDifusion
    });
    setModal(true);
  }
  function set(k: string, v: string | boolean) { setForm((f) => ({ ...f, [k]: v })); }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    const url = editando ? `/api/contactos/${editando.id}` : "/api/contactos";
    const res = await fetch(url, {
      method: editando ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, responsableId: form.responsableId || null })
    });
    setGuardando(false);
    if (res.ok) { setModal(false); router.refresh(); }
  }

  async function borrar(c: Contacto) {
    if (!confirm(`¿Borrar a ${c.nombre}? Se eliminarán sus oportunidades y conversaciones.`)) return;
    const res = await fetch(`/api/contactos/${c.id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  async function toggleEtiqueta(c: Contacto, et: Etiqueta) {
    const tiene = c.etiquetas.some((x) => x.id === et.id);
    await fetch(`/api/contactos/${c.id}/etiquetas`, {
      method: tiene ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ etiquetaId: et.id })
    });
    router.refresh();
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-navy">Contactos</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar…"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-navy/30"
          />
          <select
            value={filtroEtiqueta}
            onChange={(e) => setFiltroEtiqueta(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
          >
            <option value="">Todas las etiquetas</option>
            {etiquetas.map((et) => <option key={et.id} value={et.id}>{et.nombre}</option>)}
          </select>
          <select
            value={filtroResponsable}
            onChange={(e) => setFiltroResponsable(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
          >
            <option value="">Todos los responsables</option>
            <option value="sin">Sin asignar</option>
            {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
          <input ref={csvRef} type="file" accept=".csv,text/csv" className="hidden" onChange={importarCSV} />
          <Boton variante="ghost" onClick={() => csvRef.current?.click()} disabled={importando}>
            {importando ? "Importando…" : "Importar CSV"}
          </Boton>
          <a
            href="/api/contactos/exportar"
            download
            className="rounded-lg bg-slate-100 px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
          >
            Exportar CSV
          </a>
          <EtiquetaNueva />
          <Boton onClick={abrirNuevo}>+ Nuevo</Boton>
        </div>
      </div>

      {/* Tabla (desktop) */}
      <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Teléfono</th>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Etiquetas</th>
              <th className="px-4 py-3">Responsable</th>
              <th className="px-4 py-3">Oport.</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((c) => (
              <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">
                  {c.nombre}
                  {c.optOutDifusion && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">Sin difusión</span>}
                </td>
                <td className="px-4 py-3 text-slate-600">{c.telefono ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{c.empresa ?? "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {etiquetas.map((et) => {
                      const activa = c.etiquetas.some((x) => x.id === et.id);
                      return (
                        <button
                          key={et.id}
                          onClick={() => toggleEtiqueta(c, et)}
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={
                            activa
                              ? { background: et.color, color: "white" }
                              : { background: "#F1F5F9", color: "#64748B" }
                          }
                        >
                          {et.nombre}
                        </button>
                      );
                    })}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{c.responsable ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{c.oportunidades}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => abrirEditar(c)} className="mr-3 text-navy hover:underline">Editar</button>
                  <button onClick={() => borrar(c)} className="text-red-600 hover:underline">Borrar</button>
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Sin contactos.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Tarjetas (móvil) */}
      <div className="space-y-2 md:hidden">
        {filtrados.map((c) => (
          <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-800">
                  {c.nombre}
                  {c.optOutDifusion && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">Sin difusión</span>}
                </p>
                <p className="text-sm text-slate-600">{c.telefono ?? "Sin teléfono"}</p>
                {c.empresa && <p className="text-xs text-slate-500">{c.empresa}</p>}
              </div>
              <div className="shrink-0 text-right text-xs text-slate-500">
                <p>{c.responsable ?? "Sin asignar"}</p>
                <p>{c.oportunidades} oport.</p>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-4 border-t border-slate-100 pt-2 text-sm">
              <button onClick={() => abrirEditar(c)} className="font-medium text-navy">Editar</button>
              <button onClick={() => borrar(c)} className="font-medium text-red-600">Borrar</button>
            </div>
          </div>
        ))}
        {filtrados.length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">Sin contactos.</p>
        )}
      </div>

      <Modal abierto={modal} onClose={() => setModal(false)} titulo={editando ? "Editar contacto" : "Nuevo contacto"}>
        <form onSubmit={guardar} className="space-y-3">
          <Campo label="Nombre" value={form.nombre} onChange={(e) => set("nombre", e.target.value)} required />
          <Campo label="Teléfono (WhatsApp)" type="tel" inputMode="numeric" value={form.telefono} onChange={(e) => set("telefono", e.target.value)} placeholder="5219611234567" />
          <Campo label="Email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          <Campo label="Empresa" value={form.empresa} onChange={(e) => set("empresa", e.target.value)} />
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-600">Responsable</span>
            <select value={form.responsableId} onChange={(e) => set("responsableId", e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-navy/30">
              <option value="">Sin asignar</option>
              {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.optOutDifusion}
              onChange={(e) => set("optOutDifusion", e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-navy focus:ring-navy/30"
            />
            No incluir en difusiones masivas
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Boton type="button" variante="ghost" onClick={() => setModal(false)}>Cancelar</Boton>
            <Boton type="submit" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Boton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
