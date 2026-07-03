"use client";

import { useEffect, useState } from "react";
import { Boton, Campo, Modal } from "@/components/ui";
import { IconoBot, IconoEditar, IconoCheck, IconoCerrar, IconoReloj } from "@/components/icons";
import { EtiquetaNueva } from "@/components/EtiquetaNueva";

type Embudo = { id: string; nombre: string; etapas: { id: string; nombre: string }[] };
type Usuario = { id: string; nombre: string };
type Oportunidad = { id: string; titulo: string; valor: number; estado: string; etapaId: string; embudoId: string; etapa: string | null; embudo: string | null };
type Contacto = { id: string; nombre: string; telefono: string | null; email: string | null; empresa: string | null; notas: string | null };
type Detalle = {
  id: string;
  estado: string;
  botActivo: boolean;
  etiquetas: string[];
  responsableId: string | null;
  contacto: Contacto & { esPersonal: boolean };
  oportunidades: Oportunidad[];
};
type EtiquetaDef = { id: string; nombre: string; color: string };

const SELECT = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-navy/30";

export function PanelConversacion({
  conversacionId,
  usuarios,
  embudos,
  etiquetas = [],
  onCambio,
  onRenombrar
}: {
  conversacionId: string;
  usuarios: Usuario[];
  embudos: Embudo[];
  etiquetas?: EtiquetaDef[];
  onCambio?: () => void;
  onRenombrar?: (nombre: string) => void;
}) {
  const [d, setD] = useState<Detalle | null>(null);
  const [modal, setModal] = useState(false);
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [nombreTmp, setNombreTmp] = useState("");
  const [cForm, setCForm] = useState({ telefono: "", email: "", empresa: "", notas: "" });
  const [guardandoC, setGuardandoC] = useState(false);

  type Programado = { id: string; contenido: string; enviarAt: string };
  const [programados, setProgramados] = useState<Programado[]>([]);

  async function cargar() {
    const res = await fetch(`/api/conversaciones/${conversacionId}`);
    if (res.ok) setD(await res.json());
    const rp = await fetch(`/api/mensajes/programados?conversacionId=${conversacionId}`);
    if (rp.ok) setProgramados((await rp.json()).programados ?? []);
  }

  async function cancelarProgramado(id: string) {
    await fetch(`/api/mensajes/programados/${id}`, { method: "DELETE" });
    setProgramados((prev) => prev.filter((p) => p.id !== id));
  }

  useEffect(() => {
    setD(null);
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversacionId]);

  // Sincroniza el formulario de datos del contacto cuando carga el detalle.
  useEffect(() => {
    if (d) setCForm({ telefono: d.contacto.telefono ?? "", email: d.contacto.email ?? "", empresa: d.contacto.empresa ?? "", notas: d.contacto.notas ?? "" });
  }, [d]);

  async function guardarContacto() {
    if (!d) return;
    setGuardandoC(true);
    await fetch(`/api/contactos/${d.contacto.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cForm)
    });
    setGuardandoC(false);
    await cargar();
  }

  async function actualizarOportunidad(id: string, body: Record<string, unknown>) {
    await fetch(`/api/oportunidades/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    await cargar();
    onCambio?.();
  }

  const [recordatorioOk, setRecordatorioOk] = useState(false);
  async function crearRecordatorio(dias: number) {
    if (!d) return;
    const vence = new Date();
    vence.setDate(vence.getDate() + dias);
    vence.setHours(9, 0, 0, 0);
    const oppAbierta = d.oportunidades.find((o) => o.estado === "abierto");
    await fetch("/api/tareas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titulo: `Dar seguimiento a ${d.contacto.nombre}`,
        venceAt: vence.toISOString(),
        oportunidadId: oppAbierta?.id ?? null
      })
    });
    setRecordatorioOk(true);
    setTimeout(() => setRecordatorioOk(false), 2500);
  }

  async function patch(body: Record<string, unknown>) {
    await fetch(`/api/conversaciones/${conversacionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    await cargar();
    onCambio?.();
  }

  async function guardarNombre() {
    const nombre = nombreTmp.trim();
    setEditandoNombre(false);
    if (!d || !nombre || nombre === d.contacto.nombre) return;
    await fetch(`/api/contactos/${d.contacto.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre })
    });
    setD({ ...d, contacto: { ...d.contacto, nombre } });
    onRenombrar?.(nombre);
  }

  if (!d) return <div className="p-4 text-sm text-slate-400">Cargando…</div>;

  return (
    <div className="space-y-5 p-4">
      <div>
        {editandoNombre ? (
          <input
            autoFocus
            value={nombreTmp}
            onChange={(e) => setNombreTmp(e.target.value)}
            onBlur={guardarNombre}
            onKeyDown={(e) => {
              if (e.key === "Enter") guardarNombre();
              if (e.key === "Escape") setEditandoNombre(false);
            }}
            className="w-full rounded-lg border border-navy/40 px-2 py-1 text-base font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-navy/30"
          />
        ) : (
          <button
            onClick={() => { setNombreTmp(d.contacto.nombre); setEditandoNombre(true); }}
            title="Editar nombre"
            className="group flex items-center gap-1 text-left text-base font-semibold text-slate-800"
          >
            {d.contacto.nombre}
            <IconoEditar className="h-3.5 w-3.5 shrink-0 text-slate-400 group-hover:text-slate-600" />
          </button>
        )}
        <p className="text-xs text-slate-400">{d.contacto.telefono ? `+${d.contacto.telefono}` : "sin teléfono"}</p>
      </div>

      <details className="rounded-lg border border-slate-200">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium uppercase text-slate-400">Datos del contacto</summary>
        <div className="space-y-2 px-3 pb-3">
          <input value={cForm.telefono} onChange={(e) => setCForm({ ...cForm, telefono: e.target.value })} placeholder="Teléfono" className={SELECT} />
          <input value={cForm.email} onChange={(e) => setCForm({ ...cForm, email: e.target.value })} placeholder="Email" className={SELECT} />
          <input value={cForm.empresa} onChange={(e) => setCForm({ ...cForm, empresa: e.target.value })} placeholder="Empresa" className={SELECT} />
          <textarea value={cForm.notas} onChange={(e) => setCForm({ ...cForm, notas: e.target.value })} rows={2} placeholder="Notas (alergias, preferencias, VIP…)" className={SELECT} />
          <Boton onClick={guardarContacto} disabled={guardandoC} className="w-full">{guardandoC ? "Guardando…" : "Guardar datos"}</Boton>
        </div>
      </details>

      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase text-slate-400">Responsable</span>
        <select value={d.responsableId ?? ""} onChange={(e) => patch({ responsableId: e.target.value || null })} className={SELECT}>
          <option value="">Sin asignar</option>
          {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
        </select>
      </label>

      <div>
        <span className="mb-1 block text-xs font-medium uppercase text-slate-400">Etiquetas</span>
        <div className="flex flex-wrap items-center gap-1">
          {etiquetas.map((et) => {
            const activa = d.etiquetas.includes(et.nombre);
            return (
              <button
                key={et.id}
                onClick={() => patch({ etiquetas: activa ? d.etiquetas.filter((x) => x !== et.nombre) : [...d.etiquetas, et.nombre] })}
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={activa ? { background: et.color, color: "white" } : { background: "#F1F5F9", color: "#94A3B8" }}
              >
                {et.nombre}
              </button>
            );
          })}
          <EtiquetaNueva />
        </div>
        {etiquetas.length === 0 && (
          <p className="mt-1 text-[11px] text-slate-400">Crea etiquetas (ej. "Interesado", "VIP") para clasificar tus chats y filtrarlos en la bandeja.</p>
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
        <span className="flex items-center gap-1.5 text-sm text-slate-700"><IconoBot className="h-4 w-4" /> Bot {d.botActivo ? "activo" : "en pausa"}</span>
        <button
          onClick={() => patch({ botActivo: !d.botActivo })}
          className={`relative h-5 w-9 rounded-full transition ${d.botActivo ? "bg-green-500" : "bg-slate-300"}`}
          title={d.botActivo ? "Pausar bot (lo atiendes tu)" : "Reactivar bot"}
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${d.botActivo ? "left-[18px]" : "left-0.5"}`} />
        </button>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
        <span className="text-sm text-slate-700">Contacto personal</span>
        <button
          onClick={async () => {
            await fetch(`/api/contactos/${d.contacto.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ esPersonal: !d.contacto.esPersonal })
            });
            await cargar();
          }}
          className={`relative h-5 w-9 rounded-full transition ${d.contacto.esPersonal ? "bg-slate-400" : "bg-slate-300"}`}
          title={d.contacto.esPersonal ? "Quitar de Personal (vuelve a la bandeja principal)" : "Marcar como Personal (familia/amigos — el bot no responde)"}
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${d.contacto.esPersonal ? "left-[18px]" : "left-0.5"}`} />
        </button>
      </div>
      {d.contacto.esPersonal && (
        <p className="text-[11px] text-slate-400">
          Marcado como Personal: el bot no responde, los archivos no se guardan y aparece en la bandeja Personal.
        </p>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">Estado: <b className="capitalize text-slate-700">{d.estado}</b></span>
        {d.estado !== "cerrada" ? (
          <button onClick={() => patch({ estado: "cerrada" })} className="text-xs font-medium text-red-600 hover:underline">Cerrar chat</button>
        ) : (
          <button onClick={() => patch({ estado: "abierta" })} className="text-xs font-medium text-navy hover:underline">Reabrir</button>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium uppercase text-slate-400">Oportunidades</span>
          <button onClick={() => setModal(true)} className="text-xs font-medium text-navy hover:underline">+ Nueva</button>
        </div>
        <div className="space-y-2">
          {d.oportunidades.length === 0 && <p className="text-xs text-slate-400">Aún no está en ningún embudo.</p>}
          {d.oportunidades.map((o) => {
            const etapasEmbudo = embudos.find((e) => e.id === o.embudoId)?.etapas ?? [];
            return (
              <div key={o.id} className="space-y-2 rounded-lg border border-slate-200 p-2">
                <div className="flex items-center justify-between gap-2">
                  <a href={`/oportunidades/${o.id}`} className="truncate text-sm font-medium text-navy hover:underline">{o.titulo}</a>
                  {o.estado !== "abierto" && (
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${o.estado === "ganado" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {o.estado}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <label className="flex-1 space-y-0.5">
                    <span className="text-[10px] text-slate-400">Valor (MXN)</span>
                    <input
                      type="number"
                      defaultValue={o.valor}
                      onBlur={(e) => { if (Number(e.target.value) !== o.valor) actualizarOportunidad(o.id, { valor: e.target.value }); }}
                      className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-navy/30"
                    />
                  </label>
                  <label className="flex-1 space-y-0.5">
                    <span className="text-[10px] text-slate-400">Etapa</span>
                    <select
                      value={o.etapaId}
                      onChange={(e) => actualizarOportunidad(o.id, { etapaId: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
                    >
                      {etapasEmbudo.map((et) => <option key={et.id} value={et.id}>{et.nombre}</option>)}
                    </select>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {programados.length > 0 && (
        <div>
          <span className="mb-1 block text-xs font-medium uppercase text-slate-400">Mensajes programados</span>
          <div className="space-y-1.5">
            {programados.map((p) => (
              <div key={p.id} className="flex items-start gap-2 rounded-lg border border-slate-200 px-2.5 py-2">
                <IconoReloj className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-slate-600">{p.contenido}</p>
                  <p className="text-[10px] text-slate-400">
                    {new Date(p.enviarAt).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <button
                  onClick={() => cancelarProgramado(p.id)}
                  title="Cancelar envío"
                  aria-label="Cancelar envío programado"
                  className="grid h-5 w-5 shrink-0 place-items-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600"
                >
                  <IconoCerrar className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <span className="mb-1 block text-xs font-medium uppercase text-slate-400">Recordatorio de seguimiento</span>
        <div className="flex gap-2">
          <button onClick={() => crearRecordatorio(1)} className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs text-slate-600 hover:bg-slate-50">Mañana</button>
          <button onClick={() => crearRecordatorio(2)} className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs text-slate-600 hover:bg-slate-50">2 días</button>
          <button onClick={() => crearRecordatorio(7)} className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs text-slate-600 hover:bg-slate-50">1 semana</button>
        </div>
        {recordatorioOk && <p className="mt-1 flex items-center gap-1 text-xs text-green-600"><IconoCheck className="h-3.5 w-3.5" /> Recordatorio creado en Tareas</p>}
      </div>

      <NuevaOportModal
        abierto={modal}
        onClose={() => setModal(false)}
        contactoId={d.contacto.id}
        tituloSugerido={d.contacto.nombre}
        embudos={embudos}
        onCreada={() => { setModal(false); cargar(); onCambio?.(); }}
      />
    </div>
  );
}

function NuevaOportModal({
  abierto,
  onClose,
  contactoId,
  tituloSugerido,
  embudos,
  onCreada
}: {
  abierto: boolean;
  onClose: () => void;
  contactoId: string;
  tituloSugerido: string;
  embudos: Embudo[];
  onCreada: () => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [valor, setValor] = useState("");
  const [embudoId, setEmbudoId] = useState(embudos[0]?.id ?? "");
  const [etapaId, setEtapaId] = useState(embudos[0]?.etapas[0]?.id ?? "");
  const [guardando, setGuardando] = useState(false);

  const embudo = embudos.find((e) => e.id === embudoId);

  function cambiarEmbudo(id: string) {
    setEmbudoId(id);
    setEtapaId(embudos.find((e) => e.id === id)?.etapas[0]?.id ?? "");
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    const res = await fetch("/api/oportunidades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titulo: titulo || tituloSugerido, valor: Number(valor) || 0, embudoId, etapaId, contactoId })
    });
    setGuardando(false);
    if (res.ok) {
      setTitulo(""); setValor("");
      onCreada();
    }
  }

  return (
    <Modal abierto={abierto} onClose={onClose} titulo="Nueva oportunidad">
      <form onSubmit={crear} className="space-y-3">
        <Campo label="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={tituloSugerido} />
        <Campo label="Valor (MXN)" type="number" value={valor} onChange={(e) => setValor(e.target.value)} />
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-600">Embudo</span>
          <select value={embudoId} onChange={(e) => cambiarEmbudo(e.target.value)} className={SELECT}>
            {embudos.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-600">Etapa</span>
          <select value={etapaId} onChange={(e) => setEtapaId(e.target.value)} className={SELECT}>
            {(embudo?.etapas ?? []).map((et) => <option key={et.id} value={et.id}>{et.nombre}</option>)}
          </select>
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Boton type="button" variante="ghost" onClick={onClose}>Cancelar</Boton>
          <Boton type="submit" disabled={guardando || !embudoId || !etapaId}>{guardando ? "Creando…" : "Crear"}</Boton>
        </div>
      </form>
    </Modal>
  );
}
