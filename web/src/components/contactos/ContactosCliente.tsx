"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Boton, Campo, Modal } from "@/components/ui";
import { toast } from "@/components/Toaster";
import { EtiquetaNueva } from "@/components/EtiquetaNueva";
import { AvatarNombre } from "@/components/AvatarNombre";
import { EmptyState } from "@/components/EmptyState";
import { CamposPersonalizadosForm } from "@/components/CamposPersonalizadosForm";

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
  campos: Record<string, unknown>;
};

const FORM_VACIO = {
  nombre: "",
  telefono: "",
  email: "",
  empresa: "",
  fuente: "manual",
  responsableId: "",
  optOutDifusion: false,
  campos: {} as Record<string, unknown>,
};

export function ContactosCliente({
  contactos,
  etiquetas,
  usuarios,
  camposPersonalizados,
}: {
  contactos: Contacto[];
  etiquetas: Etiqueta[];
  usuarios: { id: string; nombre: string }[];
  camposPersonalizados: { clave: string; etiqueta: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [busqueda, setBusqueda] = useState(params.get("q") ?? "");
  const [filtroEtiqueta, setFiltroEtiqueta] = useState("");
  const [filtroResponsable, setFiltroResponsable] = useState("");
  const [modal, setModal] = useState(params.get("nuevo") === "1");
  const [editando, setEditando] = useState<Contacto | null>(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [columnasCampos, setColumnasCampos] = useState(
    camposPersonalizados.map((campo) => campo.clave),
  );
  const csvRef = useRef<HTMLInputElement>(null);

  const camposVisibles = camposPersonalizados.filter((campo) =>
    columnasCampos.includes(campo.clave),
  );

  function cambiarColumnaCampo(clave: string) {
    setColumnasCampos((columnas) =>
      columnas.includes(clave)
        ? columnas.filter((columna) => columna !== clave)
        : [...columnas, clave],
    );
  }

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return contactos.filter((c) => {
      if (
        q &&
        !(
          c.nombre.toLowerCase().includes(q) ||
          (c.telefono ?? "").includes(q) ||
          (c.empresa ?? "").toLowerCase().includes(q)
        )
      )
        return false;
      if (filtroEtiqueta && !c.etiquetas.some((e) => e.id === filtroEtiqueta))
        return false;
      if (filtroResponsable === "sin" && c.responsableId) return false;
      if (
        filtroResponsable &&
        filtroResponsable !== "sin" &&
        c.responsableId !== filtroResponsable
      )
        return false;
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
      body: JSON.stringify({ csv }),
    });
    setImportando(false);
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      toast(
        `Importación lista: ${d.creados} nuevos · ${d.actualizados} actualizados · ${d.omitidos} omitidos`,
      );
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
      optOutDifusion: c.optOutDifusion,
      campos: c.campos ?? {},
    });
    setModal(true);
  }
  function set(k: string, v: string | boolean) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    const url = editando ? `/api/contactos/${editando.id}` : "/api/contactos";
    const res = await fetch(url, {
      method: editando ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        responsableId: form.responsableId || null,
      }),
    });
    setGuardando(false);
    if (res.ok) {
      setModal(false);
      router.refresh();
    }
  }

  async function borrar(c: Contacto) {
    if (
      !confirm(
        `¿Borrar a ${c.nombre}? Se eliminarán sus oportunidades y conversaciones.`,
      )
    )
      return;
    const res = await fetch(`/api/contactos/${c.id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  async function toggleEtiqueta(c: Contacto, et: Etiqueta) {
    const tiene = c.etiquetas.some((x) => x.id === et.id);
    await fetch(`/api/contactos/${c.id}/etiquetas`, {
      method: tiene ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ etiquetaId: et.id }),
    });
    router.refresh();
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-primary">Contactos</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar…"
            className="rounded-lg border border-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
          <select
            value={filtroEtiqueta}
            onChange={(e) => setFiltroEtiqueta(e.target.value)}
            className="rounded-lg border border-input px-2 py-2 text-sm"
          >
            <option value="">Todas las etiquetas</option>
            {etiquetas.map((et) => (
              <option key={et.id} value={et.id}>
                {et.nombre}
              </option>
            ))}
          </select>
          <select
            value={filtroResponsable}
            onChange={(e) => setFiltroResponsable(e.target.value)}
            className="rounded-lg border border-input px-2 py-2 text-sm"
          >
            <option value="">Todos los responsables</option>
            <option value="sin">Sin asignar</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
          <input
            ref={csvRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={importarCSV}
          />
          <Boton
            variante="ghost"
            onClick={() => csvRef.current?.click()}
            disabled={importando}
          >
            {importando ? "Importando…" : "Importar CSV"}
          </Boton>
          <a
            href="/api/contactos/exportar"
            download
            className="rounded-lg bg-muted px-3.5 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
          >
            Exportar CSV
          </a>
          {camposPersonalizados.length > 0 && (
            <details className="relative">
              <summary className="cursor-pointer rounded-lg bg-muted px-3.5 py-2 text-sm font-medium">
                Columnas
              </summary>
              <div
                className={[
                  "absolute right-0 z-20 mt-2 min-w-56 rounded-lg",
                  "border border-border bg-card p-3 shadow-lg",
                ].join(" ")}
              >
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  Campos personalizados
                </p>
                <div className="space-y-2">
                  {camposPersonalizados.map((campo) => (
                    <label
                      key={campo.clave}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={columnasCampos.includes(campo.clave)}
                        onChange={() => cambiarColumnaCampo(campo.clave)}
                      />
                      {campo.etiqueta}
                    </label>
                  ))}
                </div>
              </div>
            </details>
          )}
          <EtiquetaNueva />
          <Boton onClick={abrirNuevo}>+ Nuevo</Boton>
        </div>
      </div>

      {/* Tabla (desktop) */}
      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
        <table className="w-full text-sm">
          <thead className="bg-background text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Contacto</th>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Etiquetas</th>
              <th className="px-4 py-3">Responsable</th>
              <th className="px-4 py-3">Oport.</th>
              {camposVisibles.map((campo) => (
                <th key={campo.clave} className="px-4 py-3">
                  {campo.etiqueta}
                </th>
              ))}
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((c) => (
              <tr
                key={c.id}
                className="h-10 border-t border-border/60 hover:bg-muted/60"
              >
                <td className="px-4 py-1.5">
                  <div className="flex items-center gap-3">
                    <AvatarNombre nombre={c.nombre} className="h-8 w-8" />
                    <div className="min-w-0 leading-tight">
                      <p className="truncate font-medium text-foreground">
                        {c.nombre}
                        {c.optOutDifusion && (
                          <span
                            className={[
                              "ml-2 rounded bg-muted px-1.5 py-0.5",
                              "text-[10px] font-medium text-muted-foreground",
                            ].join(" ")}
                          >
                            Sin difusión
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.telefono ? `+${c.telefono}` : "Sin teléfono"}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-1.5 text-muted-foreground">
                  {c.empresa ?? "—"}
                </td>
                <td className="px-4 py-1.5">
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
                              : {
                                  background: "hsl(var(--muted))",
                                  color: "hsl(var(--muted-foreground))",
                                }
                          }
                        >
                          {et.nombre}
                        </button>
                      );
                    })}
                  </div>
                </td>
                <td className="px-4 py-1.5 text-muted-foreground">
                  {c.responsable ?? "—"}
                </td>
                <td className="tnum px-4 py-1.5 text-muted-foreground">
                  {c.oportunidades}
                </td>
                {camposVisibles.map((campo) => (
                  <td
                    key={campo.clave}
                    className="px-4 py-1.5 text-muted-foreground"
                  >
                    {String(c.campos?.[campo.clave] ?? "—")}
                  </td>
                ))}
                <td className="px-4 py-1.5 text-right">
                  <button
                    onClick={() => abrirEditar(c)}
                    className="mr-3 text-primary hover:underline"
                  >
                    Editar
                  </button>
                  <Link
                    href={`/citas?contactoId=${c.id}`}
                    className="mr-3 text-primary hover:underline"
                  >
                    Cita
                  </Link>
                  <button
                    onClick={() => borrar(c)}
                    className="text-red-600 hover:underline"
                  >
                    Borrar
                  </button>
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={6 + camposVisibles.length} className="p-4">
                  <EmptyState
                    titulo="Sin contactos"
                    descripcion="Agrega el primer contacto para comenzar a gestionar conversaciones y oportunidades."
                    accion="Nuevo contacto"
                    href="/contactos?nuevo=1"
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Tarjetas (móvil) */}
      <div className="space-y-2 md:hidden">
        {filtrados.map((c) => (
          <div
            key={c.id}
            className="rounded-xl border border-border bg-card p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={[
                    "grid h-10 w-10 shrink-0 place-items-center rounded-full",
                    "bg-primary/10 text-sm font-bold text-primary",
                  ].join(" ")}
                >
                  {c.nombre.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 leading-tight">
                  <p className="truncate font-medium text-foreground">
                    {c.nombre}
                    {c.optOutDifusion && (
                      <span
                        className={[
                          "ml-2 rounded bg-muted px-1.5 py-0.5",
                          "text-[10px] font-medium text-muted-foreground",
                        ].join(" ")}
                      >
                        Sin difusión
                      </span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.telefono ? `+${c.telefono}` : "Sin teléfono"}
                  </p>
                  {c.empresa && (
                    <p className="truncate text-xs text-muted-foreground">
                      {c.empresa}
                    </p>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-right text-xs text-muted-foreground">
                <p>{c.responsable ?? "Sin asignar"}</p>
                <p>{c.oportunidades} oport.</p>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-4 border-t border-border/60 pt-2 text-sm">
              <button
                onClick={() => abrirEditar(c)}
                className="font-medium text-primary"
              >
                Editar
              </button>
              <Link
                href={`/citas?contactoId=${c.id}`}
                className="font-medium text-primary"
              >
                Cita
              </Link>
              <button
                onClick={() => borrar(c)}
                className="font-medium text-red-600"
              >
                Borrar
              </button>
            </div>
          </div>
        ))}
        {filtrados.length === 0 && (
          <p className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            Sin contactos.
          </p>
        )}
      </div>

      <Modal
        abierto={modal}
        onClose={() => setModal(false)}
        titulo={editando ? "Editar contacto" : "Nuevo contacto"}
      >
        <form onSubmit={guardar} className="space-y-3">
          <Campo
            label="Nombre"
            value={form.nombre}
            onChange={(e) => set("nombre", e.target.value)}
            required
          />
          <Campo
            label="Teléfono (WhatsApp)"
            type="tel"
            inputMode="numeric"
            value={form.telefono}
            onChange={(e) => set("telefono", e.target.value)}
            placeholder="5219611234567"
          />
          <Campo
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
          <Campo
            label="Empresa"
            value={form.empresa}
            onChange={(e) => set("empresa", e.target.value)}
          />
          <label className="block space-y-1">
            <span className="text-sm font-medium text-muted-foreground">
              Responsable
            </span>
            <select
              value={form.responsableId}
              onChange={(e) => set("responsableId", e.target.value)}
              className={[
                "w-full rounded-lg border border-input px-3 py-2 text-sm",
                "outline-none focus:ring-2 focus:ring-primary/30",
              ].join(" ")}
            >
              <option value="">Sin asignar</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={form.optOutDifusion}
              onChange={(e) => set("optOutDifusion", e.target.checked)}
              className="h-4 w-4 rounded border-input text-primary focus:ring-primary/30"
            />
            No incluir en difusiones masivas
          </label>
          <CamposPersonalizadosForm
            entidad="contacto"
            valores={form.campos}
            onChange={(campos) => setForm({ ...form, campos })}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Boton
              type="button"
              variante="ghost"
              onClick={() => setModal(false)}
            >
              Cancelar
            </Boton>
            <Boton type="submit" disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar"}
            </Boton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
