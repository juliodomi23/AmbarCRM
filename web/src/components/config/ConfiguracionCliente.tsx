"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, Campo } from "@/components/ui";
import { EmbeddedSignup } from "@/components/config/EmbeddedSignup";

const TABS = ["Embudos", "Usuarios", "Canal WhatsApp", "Plantillas", "Automatizaciones", "Bots", "IA"] as const;
type Tab = (typeof TABS)[number];

async function api(url: string, metodo: string, body?: unknown) {
  const res = await fetch(url, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    alert(d.error ?? "Error");
    return false;
  }
  return true;
}

export function ConfiguracionCliente({
  embudos,
  usuarios,
  canales,
  plantillas,
  ajustes,
  bots
}: {
  embudos: any[];
  usuarios: any[];
  canales: any[];
  plantillas: any[];
  ajustes: any;
  bots: any[];
}) {
  const [tab, setTab] = useState<Tab>("Embudos");

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-4 text-xl font-bold text-navy">Configuración</h1>
      <div className="mb-5 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t ? "border-navy text-navy" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Embudos" && <TabEmbudos embudos={embudos} />}
      {tab === "Usuarios" && <TabUsuarios usuarios={usuarios} />}
      {tab === "Canal WhatsApp" && <TabCanal canal={canales[0]} />}
      {tab === "Plantillas" && <TabPlantillas plantillas={plantillas} />}
      {tab === "Automatizaciones" && <TabAutomatizaciones ajustes={ajustes} />}
      {tab === "Bots" && <TabBots bots={bots} canales={canales} />}
      {tab === "IA" && <TabIA ajustes={ajustes} />}
    </div>
  );
}

function TabIA({ ajustes }: { ajustes: any }) {
  const router = useRouter();
  const [f, setF] = useState({
    nombreNegocio: ajustes?.nombreNegocio ?? "",
    iaPromptSistema: ajustes?.iaPromptSistema ?? ""
  });
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    const ok = await api("/api/ajustes", "PATCH", f);
    setGuardando(false);
    if (ok) router.refresh();
  }

  return (
    <div className="max-w-lg space-y-4">
      <div className="rounded-xl border border-slate-200 bg-amber-50/60 p-3 text-xs text-slate-600">
        La IA usa el modelo <b>Claude Haiku</b> para sugerir respuestas. Configura el contexto de tu negocio aquí para que las sugerencias sean más precisas y con el tono correcto.
      </div>

      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Nombre del negocio</span>
          <input
            value={f.nombreNegocio}
            onChange={(e) => setF({ ...f, nombreNegocio: e.target.value })}
            placeholder="Ej: Clínica Serénica, Pie Feliz Podología…"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-navy/30"
          />
          <span className="text-xs text-slate-400">Se incluye en el contexto de la IA ("Trabajas para X").</span>
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Instrucciones de la IA (prompt de sistema)</span>
          <textarea
            value={f.iaPromptSistema}
            onChange={(e) => setF({ ...f, iaPromptSistema: e.target.value })}
            rows={5}
            placeholder={
              "Eres un asistente de atención al cliente por WhatsApp. " +
              "Redacta la siguiente respuesta del agente: breve, cordial, en español neutro, lista para enviar. " +
              "Devuelve SOLO el texto, sin comillas ni explicaciones."
            }
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-navy/30"
          />
          <span className="text-xs text-slate-400">
            Si lo dejas vacío se usa el prompt por defecto. Personaliza el tono, la personalidad o las instrucciones del agente.
          </span>
        </label>

        <Boton onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Boton>
      </div>
    </div>
  );
}

function TabBots({ bots, canales }: { bots: any[]; canales: any[] }) {
  const router = useRouter();
  const [f, setF] = useState({ nombre: "", webhookUrl: "", canalId: "" });
  const origin = typeof window !== "undefined" ? window.location.origin : "https://crm.tudominio.com";

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!f.nombre.trim() || !f.webhookUrl.trim()) return;
    if (await api("/api/bots", "POST", { ...f, canalId: f.canalId || null })) {
      setF({ nombre: "", webhookUrl: "", canalId: "" });
      router.refresh();
    }
  }
  async function toggle(b: any) {
    if (await api(`/api/bots/${b.id}`, "PATCH", { activo: !b.activo })) router.refresh();
  }
  async function regenerar(b: any) {
    if (!confirm("¿Regenerar el token? El valor anterior dejará de funcionar.")) return;
    if (await api(`/api/bots/${b.id}`, "PATCH", { regenerarToken: true })) router.refresh();
  }
  async function borrar(b: any) {
    if (!confirm(`¿Borrar el bot "${b.nombre}"?`)) return;
    if (await api(`/api/bots/${b.id}`, "DELETE")) router.refresh();
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="rounded-xl border border-slate-200 bg-amber-50/60 p-4 text-xs text-slate-600">
        <p className="mb-1 font-semibold text-slate-700">Cómo conectar un bot de n8n (estilo Chatwoot)</p>
        <ol className="list-decimal space-y-1 pl-4">
          <li>En tu workflow de n8n, agrega un nodo <b>Webhook</b> y copia su <b>Production URL</b>.</li>
          <li>Crea aquí el bot pegando esa URL en <b>Webhook URL</b>. El CRM le mandará cada mensaje entrante (payload <code>message_created</code>).</li>
          <li>Para responder, el bot llama a la API del CRM (formato Chatwoot) con el <b>token</b> de abajo en el header <code>api_access_token</code>.</li>
        </ol>
      </div>

      <form onSubmit={crear} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <Campo label="Nombre del bot" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required />
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-600">Canal</span>
          <select value={f.canalId} onChange={(e) => setF({ ...f, canalId: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Todos los canales</option>
            {canales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>
        <div className="sm:col-span-2">
          <Campo label="Webhook URL (nodo Webhook de n8n)" value={f.webhookUrl}
            onChange={(e) => setF({ ...f, webhookUrl: e.target.value })} placeholder="https://n8n.tudominio.com/webhook/bot-x" required />
        </div>
        <div className="sm:col-span-2"><Boton type="submit">+ Crear bot</Boton></div>
      </form>

      <div className="space-y-3">
        {bots.length === 0 && <p className="text-sm text-slate-400">Sin bots configurados.</p>}
        {bots.map((b) => (
          <div key={b.id} className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-800">{b.nombre}</p>
                <p className="text-xs text-slate-400">{b.canal?.nombre ?? "Todos los canales"}</p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <button onClick={() => toggle(b)} className={b.activo ? "text-green-600" : "text-slate-400"}>
                  {b.activo ? "● Activo" : "○ Inactivo"}
                </button>
                <button onClick={() => borrar(b)} className="text-red-600 hover:underline">Borrar</button>
              </div>
            </div>

            <div className="rounded-lg bg-slate-50 p-3 text-xs">
              <p className="text-slate-500">Webhook (CRM → n8n):</p>
              <code className="block break-all text-slate-700">{b.webhookUrl}</code>
            </div>

            <div className="rounded-lg bg-slate-50 p-3 text-xs">
              <div className="flex items-center justify-between">
                <p className="text-slate-500">Token (header <code>api_access_token</code>):</p>
                <button onClick={() => regenerar(b)} className="text-navy hover:underline">Regenerar</button>
              </div>
              <code className="block break-all text-slate-700">{b.apiToken}</code>
            </div>

            <div className="rounded-lg bg-slate-50 p-3 text-xs">
              <p className="text-slate-500">Endpoint para responder (formato Chatwoot):</p>
              <code className="block break-all text-slate-700">POST {origin}/api/v1/accounts/1/conversations/&#123;&#123;conversationId&#125;&#125;/messages</code>
              <p className="mt-1 text-slate-500">Handoff (ceder a humano): manda la etiqueta <code>escalado_humano</code> a:</p>
              <code className="block break-all text-slate-700">POST {origin}/api/v1/accounts/1/conversations/&#123;&#123;conversationId&#125;&#125;/labels</code>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TabAutomatizaciones({ ajustes }: { ajustes: any }) {
  const router = useRouter();
  const [f, setF] = useState({
    autoAsignar: !!ajustes?.autoAsignar,
    bienvenidaActiva: !!ajustes?.bienvenidaActiva,
    bienvenidaTexto: ajustes?.bienvenidaTexto ?? "",
    crearLeadAuto: ajustes?.crearLeadAuto ?? true,
    csatActivo: !!ajustes?.csatActivo,
    csatTexto: ajustes?.csatTexto ?? "",
    horarioActivo: !!ajustes?.horarioActivo,
    horarioInicio: ajustes?.horarioInicio ?? "09:00",
    horarioFin: ajustes?.horarioFin ?? "18:00",
    horarioDias: ajustes?.horarioDias ?? "1,2,3,4,5",
    fueraHorarioTexto: ajustes?.fueraHorarioTexto ?? "",
    autoResolverActivo: !!ajustes?.autoResolverActivo,
    autoResolverHoras: ajustes?.autoResolverHoras ?? 24
  });
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    const ok = await api("/api/ajustes", "PATCH", { ...f, autoResolverHoras: Number(f.autoResolverHoras) || 24 });
    setGuardando(false);
    if (ok) router.refresh();
  }

  return (
    <div className="max-w-lg space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={f.autoAsignar}
            onChange={(e) => setF({ ...f, autoAsignar: e.target.checked })}
            className="mt-1 h-4 w-4 accent-navy"
          />
          <span>
            <span className="block text-sm font-medium text-slate-700">Auto-asignar leads nuevos</span>
            <span className="block text-xs text-slate-500">
              Al entrar un WhatsApp de un número nuevo, lo asigna al agente activo con menos conversaciones (reparto parejo).
            </span>
          </span>
        </label>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={f.crearLeadAuto}
            onChange={(e) => setF({ ...f, crearLeadAuto: e.target.checked })}
            className="mt-1 h-4 w-4 accent-navy"
          />
          <span>
            <span className="block text-sm font-medium text-slate-700">Crear lead en el embudo automáticamente</span>
            <span className="block text-xs text-slate-500">
              Cada contacto nuevo entra como oportunidad en la primera etapa del embudo principal. El bot o el agente lo van moviendo.
            </span>
          </span>
        </label>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={f.bienvenidaActiva}
            onChange={(e) => setF({ ...f, bienvenidaActiva: e.target.checked })}
            className="mt-1 h-4 w-4 accent-navy"
          />
          <span>
            <span className="block text-sm font-medium text-slate-700">Mensaje de bienvenida automático</span>
            <span className="block text-xs text-slate-500">
              Se envía solo la primera vez que un contacto escribe.
            </span>
          </span>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-600">Texto de bienvenida</span>
          <textarea
            value={f.bienvenidaTexto}
            onChange={(e) => setF({ ...f, bienvenidaTexto: e.target.value })}
            rows={3}
            disabled={!f.bienvenidaActiva}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-navy/30 disabled:bg-slate-50"
          />
          <span className="text-xs text-slate-400">Variables: {"{{nombre}}"}, {"{{nombre_completo}}"}, {"{{telefono}}"}.</span>
        </label>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <label className="flex items-start gap-3">
          <input type="checkbox" checked={f.csatActivo} onChange={(e) => setF({ ...f, csatActivo: e.target.checked })} className="mt-1 h-4 w-4 accent-navy" />
          <span>
            <span className="block text-sm font-medium text-slate-700">Encuesta de satisfacción (CSAT)</span>
            <span className="block text-xs text-slate-500">Al cerrar una conversación se manda una pregunta 1-5 y se guarda la respuesta del cliente.</span>
          </span>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-600">Texto de la encuesta</span>
          <textarea value={f.csatTexto} onChange={(e) => setF({ ...f, csatTexto: e.target.value })} rows={2} disabled={!f.csatActivo}
            placeholder="¿Cómo calificarías nuestra atención del 1 al 5? Responde solo con el número 🙏"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-navy/30 disabled:bg-slate-50" />
        </label>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <label className="flex items-start gap-3">
          <input type="checkbox" checked={f.horarioActivo} onChange={(e) => setF({ ...f, horarioActivo: e.target.checked })} className="mt-1 h-4 w-4 accent-navy" />
          <span>
            <span className="block text-sm font-medium text-slate-700">Mensaje fuera de horario</span>
            <span className="block text-xs text-slate-500">Si entra un mensaje fuera del horario de atención, se responde automáticamente (máx. una vez cada 4 h por chat).</span>
          </span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">Desde</span>
            <input type="time" value={f.horarioInicio} onChange={(e) => setF({ ...f, horarioInicio: e.target.value })} disabled={!f.horarioActivo}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">Hasta</span>
            <input type="time" value={f.horarioFin} onChange={(e) => setF({ ...f, horarioFin: e.target.value })} disabled={!f.horarioActivo}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50" />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">Días hábiles (1=lunes … 7=domingo)</span>
          <input value={f.horarioDias} onChange={(e) => setF({ ...f, horarioDias: e.target.value })} disabled={!f.horarioActivo} placeholder="1,2,3,4,5"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-600">Texto fuera de horario</span>
          <textarea value={f.fueraHorarioTexto} onChange={(e) => setF({ ...f, fueraHorarioTexto: e.target.value })} rows={2} disabled={!f.horarioActivo}
            placeholder="¡Gracias por escribir! Nuestro horario es de 9 a 18 h. Te respondemos en cuanto abramos 🙌"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-navy/30 disabled:bg-slate-50" />
        </label>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <label className="flex items-start gap-3">
          <input type="checkbox" checked={f.autoResolverActivo} onChange={(e) => setF({ ...f, autoResolverActivo: e.target.checked })} className="mt-1 h-4 w-4 accent-navy" />
          <span>
            <span className="block text-sm font-medium text-slate-700">Auto-resolver chats inactivos</span>
            <span className="block text-xs text-slate-500">Cierra conversaciones sin actividad. Requiere llamar al endpoint cron desde n8n (ver INTEGRACION-BOTS.md).</span>
          </span>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">Cerrar tras (horas sin actividad)</span>
          <input type="number" min={1} value={f.autoResolverHoras} onChange={(e) => setF({ ...f, autoResolverHoras: e.target.value as any })} disabled={!f.autoResolverActivo}
            className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50" />
        </label>
      </div>

      <Boton onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</Boton>
    </div>
  );
}

function TabEmbudos({ embudos }: { embudos: any[] }) {
  const router = useRouter();
  const [nuevo, setNuevo] = useState("");
  const [etapaForm, setEtapaForm] = useState<Record<string, { nombre: string; tipo: string }>>({});

  async function crearEmbudo() {
    if (!nuevo.trim()) return;
    if (await api("/api/embudos", "POST", { nombre: nuevo })) { setNuevo(""); router.refresh(); }
  }
  async function borrarEmbudo(id: string) {
    if (!confirm("¿Borrar embudo y todas sus etapas/oportunidades?")) return;
    if (await api(`/api/embudos/${id}`, "DELETE")) router.refresh();
  }
  async function crearEtapa(embudoId: string) {
    const f = etapaForm[embudoId];
    if (!f?.nombre?.trim()) return;
    if (await api("/api/etapas", "POST", { embudoId, nombre: f.nombre, tipo: f.tipo || "normal" })) {
      setEtapaForm((p) => ({ ...p, [embudoId]: { nombre: "", tipo: "normal" } }));
      router.refresh();
    }
  }
  async function borrarEtapa(id: string) {
    if (await api(`/api/etapas/${id}`, "DELETE")) router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input value={nuevo} onChange={(e) => setNuevo(e.target.value)} placeholder="Nombre del embudo"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-navy/30" />
        <Boton onClick={crearEmbudo}>+ Embudo</Boton>
      </div>

      {embudos.map((e) => (
        <div key={e.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-slate-700">{e.nombre}</h3>
            <button onClick={() => borrarEmbudo(e.id)} className="text-xs text-red-600 hover:underline">Borrar embudo</button>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {e.etapas.map((et: any) => (
              <span key={et.id} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-white" style={{ background: et.color }}>
                {et.nombre}
                <button onClick={() => borrarEtapa(et.id)} className="ml-1 opacity-80 hover:opacity-100">×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={etapaForm[e.id]?.nombre ?? ""}
              onChange={(ev) => setEtapaForm((p) => ({ ...p, [e.id]: { ...(p[e.id] ?? { tipo: "normal" }), nombre: ev.target.value } }))}
              placeholder="Nueva etapa"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-navy/30"
            />
            <select
              value={etapaForm[e.id]?.tipo ?? "normal"}
              onChange={(ev) => setEtapaForm((p) => ({ ...p, [e.id]: { ...(p[e.id] ?? { nombre: "" }), tipo: ev.target.value } }))}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="normal">Normal</option>
              <option value="ganado">Ganado</option>
              <option value="perdido">Perdido</option>
            </select>
            <Boton variante="ghost" onClick={() => crearEtapa(e.id)}>+ Etapa</Boton>
          </div>
        </div>
      ))}
    </div>
  );
}

function TabUsuarios({ usuarios }: { usuarios: any[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ nombre: "", email: "", password: "", rol: "agente" });

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (await api("/api/usuarios", "POST", form)) {
      setForm({ nombre: "", email: "", password: "", rol: "agente" });
      router.refresh();
    }
  }
  async function toggleActivo(u: any) {
    if (await api(`/api/usuarios/${u.id}`, "PATCH", { activo: !u.activo })) router.refresh();
  }

  return (
    <div className="space-y-5">
      <form onSubmit={crear} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
        <Campo label="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
        <Campo label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <Campo label="Contraseña" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-600">Rol</span>
          <select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="agente">Agente</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <div className="sm:col-span-2"><Boton type="submit">+ Crear usuario</Boton></div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Rol</th><th className="px-4 py-3">Estado</th><th></th></tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-800">{u.nombre}</td>
                <td className="px-4 py-3 text-slate-600">{u.email}</td>
                <td className="px-4 py-3 capitalize text-slate-600">{u.rol}</td>
                <td className="px-4 py-3">{u.activo ? "Activo" : "Inactivo"}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => toggleActivo(u)} className="text-navy hover:underline">
                    {u.activo ? "Desactivar" : "Activar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabCanal({ canal }: { canal: any }) {
  const router = useRouter();
  const [f, setF] = useState({
    nombre: canal?.nombre ?? "",
    proveedor: canal?.proveedor ?? "evolution",
    telefono: canal?.telefono ?? "",
    instancia: canal?.instancia ?? "",
    estado: canal?.estado ?? "desconectado"
  });
  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (await api(`/api/canales/${canal.id}`, "PATCH", f)) router.refresh();
  }

  // El Embedded Signup (WhatsApp Oficial) crea su propio canal; se muestra siempre.
  if (!canal) {
    return (
      <div className="max-w-lg space-y-4">
        <EmbeddedSignup />
        <p className="text-slate-400">No hay otro canal configurado.</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg space-y-4">
      <EmbeddedSignup />
      <ConexionCanal canal={canal} />

      <form onSubmit={guardar} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <Campo label="Nombre del canal" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-600">Proveedor</span>
          <select value={f.proveedor} onChange={(e) => setF({ ...f, proveedor: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="evolution">Evolution API</option>
            <option value="cloud_api">WhatsApp Cloud API (Meta)</option>
          </select>
        </label>
        <Campo label="Teléfono" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
        <Campo
          label={f.proveedor === "cloud_api" ? "Phone Number ID (Meta)" : "Instancia (Evolution)"}
          value={f.instancia}
          onChange={(e) => setF({ ...f, instancia: e.target.value })}
        />
        <p className="text-xs text-slate-400">Las claves/tokens viven en variables de entorno, no aquí. Ver INTEGRACION-N8N.md.</p>
        <Boton type="submit">Guardar</Boton>
      </form>
    </div>
  );
}

const COLOR_ESTADO: Record<string, string> = {
  conectado: "bg-green-100 text-green-700",
  conectando: "bg-amber-100 text-amber-700",
  desconectado: "bg-slate-100 text-slate-600"
};

/** Vincula el número de WhatsApp por QR contra Evolution y muestra el estado real. */
function ConexionCanal({ canal }: { canal: any }) {
  const [estado, setEstado] = useState<string>(canal?.estado ?? "desconectado");
  const [telefono, setTelefono] = useState<string | undefined>(canal?.telefono || undefined);
  const [qr, setQr] = useState<string | null>(null);
  const [pairing, setPairing] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [impResultado, setImpResultado] = useState<string | null>(null);
  const polling = useRef<ReturnType<typeof setInterval> | null>(null);

  function detenerPolling() {
    if (polling.current) {
      clearInterval(polling.current);
      polling.current = null;
    }
  }

  async function consultarEstado() {
    const res = await fetch(`/api/canales/${canal.id}/estado`);
    if (!res.ok) return;
    const d = await res.json();
    setEstado(d.estado);
    if (d.telefono) setTelefono(d.telefono);
    if (d.estado === "conectado") {
      setQr(null);
      setPairing(null);
      detenerPolling();
    }
  }

  // Estado inicial real al abrir + limpieza del polling al desmontar.
  useEffect(() => {
    if (canal?.proveedor === "evolution") consultarEstado();
    return detenerPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function conectar() {
    setCargando(true);
    setError(null);
    const res = await fetch(`/api/canales/${canal.id}/conectar`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setCargando(false);
    if (!res.ok || d.ok === false) {
      setError(d.error ?? "No se pudo iniciar la conexión");
      return;
    }
    setEstado(d.estado);
    if (d.telefono) setTelefono(d.telefono);
    setQr(d.qrBase64 ?? null);
    setPairing(d.pairingCode ?? null);
    if (d.estado === "conectado") {
      setQr(null);
      setPairing(null);
    } else {
      detenerPolling();
      polling.current = setInterval(consultarEstado, 3000);
    }
  }

  async function desconectar() {
    if (!confirm("¿Cerrar la sesión de WhatsApp de este número?")) return;
    setCargando(true);
    setError(null);
    const res = await fetch(`/api/canales/${canal.id}/desconectar`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setCargando(false);
    detenerPolling();
    setQr(null);
    setPairing(null);
    setEstado("desconectado");
    if (!res.ok) setError(d.error ?? "Error al desconectar");
  }

  async function importar() {
    setImportando(true);
    setImpResultado(null);
    const res = await fetch(`/api/canales/${canal.id}/importar`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setImportando(false);
    if (res.ok) setImpResultado(`✓ ${d.contactosNuevos} contactos y ${d.chatsNuevos} chats nuevos importados (de ${d.contactos} contactos y ${d.chats} chats en WhatsApp).`);
    else setImpResultado(d.error ?? "No se pudo importar");
  }

  if (!canal) return <p className="text-slate-400">No hay canal configurado.</p>;
  if (canal.proveedor !== "evolution") {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
        WhatsApp Cloud API (Meta) se vincula con token en variables de entorno, no por QR.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-slate-700">Conexión</h3>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${COLOR_ESTADO[estado] ?? COLOR_ESTADO.desconectado}`}>
          {estado}
        </span>
      </div>

      {estado === "conectado" ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Número vinculado{telefono ? `: +${telefono}` : ""}. Ya puedes enviar y recibir mensajes.
          </p>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="mb-1 text-sm font-medium text-slate-700">Importar de WhatsApp</p>
            <p className="mb-2 text-xs text-slate-500">Trae tus contactos y chats actuales al CRM. Puedes repetirlo; no duplica.</p>
            <Boton onClick={importar} disabled={importando}>{importando ? "Importando…" : "Importar contactos y chats"}</Boton>
            {impResultado && <p className="mt-2 text-xs text-slate-600">{impResultado}</p>}
          </div>
          <Boton variante="ghost" onClick={desconectar} disabled={cargando}>
            {cargando ? "..." : "Desconectar"}
          </Boton>
        </div>
      ) : (
        <div className="space-y-3">
          {qr ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-600">
                Abre WhatsApp → <strong>Dispositivos vinculados</strong> → <strong>Vincular dispositivo</strong> y escanea:
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="Código QR de WhatsApp" className="h-56 w-56 rounded-lg border border-slate-200" />
              {pairing && (
                <p className="text-sm text-slate-600">
                  ¿Sin cámara? Código de emparejamiento: <strong className="tracking-widest">{pairing}</strong>
                </p>
              )}
              <p className="text-xs text-amber-600">Esperando escaneo… (se verifica solo cada 3 s)</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">El número no está vinculado.</p>
          )}
          <Boton onClick={conectar} disabled={cargando}>
            {cargando ? "Generando…" : qr ? "Regenerar QR" : "Conectar WhatsApp"}
          </Boton>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}

function TabPlantillas({ plantillas }: { plantillas: any[] }) {
  const router = useRouter();
  const [f, setF] = useState({ nombre: "", contenido: "" });

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (await api("/api/plantillas", "POST", f)) { setF({ nombre: "", contenido: "" }); router.refresh(); }
  }
  async function borrar(id: string) {
    if (await api(`/api/plantillas/${id}`, "DELETE")) router.refresh();
  }

  return (
    <div className="space-y-5">
      <form onSubmit={crear} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <Campo label="Nombre" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} required />
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-600">Contenido</span>
          <textarea value={f.contenido} onChange={(e) => setF({ ...f, contenido: e.target.value })} rows={3} required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-navy/30" />
        </label>
        <Boton type="submit">+ Crear plantilla</Boton>
      </form>

      <div className="space-y-2">
        {plantillas.map((p) => (
          <div key={p.id} className="flex items-start justify-between rounded-xl border border-slate-200 bg-white p-3">
            <div>
              <p className="text-sm font-medium text-slate-800">{p.nombre}</p>
              <p className="text-sm text-slate-500">{p.contenido}</p>
            </div>
            <button onClick={() => borrar(p.id)} className="text-xs text-red-600 hover:underline">Borrar</button>
          </div>
        ))}
        {plantillas.length === 0 && <p className="text-sm text-slate-400">Sin plantillas.</p>}
      </div>
    </div>
  );
}
