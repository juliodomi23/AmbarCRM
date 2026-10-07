"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Boton, Campo, Modal } from "@/components/ui";
import { toast } from "@/components/Toaster";
import { MetaCanales } from "@/components/config/MetaCanales";
import { MarcaConfig } from "@/components/config/MarcaConfig";
import { CitasConfig } from "@/components/config/CitasConfig";

const TABS = [
  "Marca",
  "Embudos",
  "Usuarios",
  "Canal WhatsApp",
  "Plantillas",
  "Plantillas de Meta",
  "Automatizaciones",
  "Bots",
  "IA",
  "Módulos",
  "Campos personalizados",
] as const;
type Tab = (typeof TABS)[number] | "Clientes Ámbar CRM";

async function api(url: string, metodo: string, body?: unknown) {
  const res = await fetch(url, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    toast(d.error ?? "Ocurrió un error", "error");
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
  bots,
  orgs = null,
  modulosPorOrg = null,
  modulos = [],
}: {
  embudos: any[];
  usuarios: any[];
  canales: any[];
  plantillas: any[];
  ajustes: any;
  bots: any[];
  orgs?: any[] | null;
  modulosPorOrg?: Record<string, any[]> | null;
  modulos?: any[];
}) {
  const [tab, setTab] = useState<Tab>("Embudos");
  // "Clientes" solo aparece para la org plataforma (orgs viene null para las demás).
  const tabs: Tab[] = orgs ? [...TABS, "Clientes Ámbar CRM"] : [...TABS];

  // Abrir directo en una pestaña: /configuracion?tab=canal (lo usa "Primeros pasos").
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    const mapa: Record<string, Tab> = {
      embudos: "Embudos",
      marca: "Marca",
      usuarios: "Usuarios",
      canal: "Canal WhatsApp",
      plantillas: "Plantillas",
      meta: "Plantillas de Meta",
      automatizaciones: "Automatizaciones",
      bots: "Bots",
      ia: "IA",
      clientes: "Clientes Ámbar CRM",
    };
    if (t && mapa[t]) setTab(mapa[t]);
  }, []);

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-4 text-xl font-bold text-primary">Configuración</h1>
      <div className="mb-5 flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Marca" && <MarcaConfig ajustes={ajustes} />}
      {tab === "Embudos" && <TabEmbudos embudos={embudos} />}
      {tab === "Usuarios" && <TabUsuarios usuarios={usuarios} />}
      {tab === "Canal WhatsApp" && <TabCanal canales={canales} />}
      {tab === "Plantillas" && <TabPlantillas plantillas={plantillas} />}
      {tab === "Plantillas de Meta" && (
        <MetaCanales canales={canales} vista="plantillas" />
      )}
      {tab === "Automatizaciones" && <TabAutomatizaciones ajustes={ajustes} />}
      {tab === "Bots" && <TabBots bots={bots} canales={canales} />}
      {tab === "IA" && <TabIA ajustes={ajustes} />}
      {tab === "Clientes Ámbar CRM" && orgs && (
        <TabClientes
          orgs={orgs}
          modulosPorOrg={modulosPorOrg ?? {}}
          modulos={modulos}
        />
      )}
      {tab === "Módulos" && <TabModulos modulos={modulos} canales={canales} />}
      {tab === "Campos personalizados" && <TabCamposPersonalizados />}
    </div>
  );
}

function slugificar(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function TabModulos({ modulos, canales }: { modulos: any[]; canales: any[] }) {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [config, setConfig] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch("/api/modulos")
      .then((r) => r.json())
      .then((d) => {
        setItems(d.modulos ?? []);
        setConfig(
          Object.fromEntries(
            (d.modulos ?? []).map((m: any) => [
              m.clave,
              JSON.stringify(m.config ?? {}, null, 2),
            ]),
          ),
        );
      });
  }, []);
  async function guardar(clave: string) {
    try {
      const body = JSON.parse(config[clave] || "{}");
      if (await api("/api/modulos", "PATCH", { clave, config: body }))
        router.refresh();
    } catch {
      toast("La configuración debe ser JSON válido", "error");
    }
  }
  return (
    <div className="max-w-2xl space-y-3">
      {items.map((m) => (
        <div
          key={m.clave}
          className="rounded-xl border border-border bg-card p-4"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{m.nombre}</p>
              <p className="text-xs text-muted-foreground">{m.descripcion}</p>
            </div>
            <span
              className={
                m.activo
                  ? "text-xs text-success"
                  : "text-xs text-muted-foreground"
              }
            >
              {m.activo ? "Activo" : "No activado"}
            </span>
          </div>
          {m.activo && (
            <>
              {m.clave === "citas" && (
                <CitasConfig modulo={m} canales={canales} />
              )}
              {m.clave !== "citas" && (
                <textarea
                  value={config[m.clave] ?? "{}"}
                  onChange={(e) =>
                    setConfig({ ...config, [m.clave]: e.target.value })
                  }
                  rows={5}
                  className="mt-3 w-full rounded-lg border border-input p-2 font-mono text-xs"
                />
              )}
              {m.clave !== "citas" && (
                <Boton className="mt-2" onClick={() => guardar(m.clave)}>
                  Guardar configuración
                </Boton>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function TabCamposPersonalizados() {
  const [campos, setCampos] = useState<any[]>([]);
  const [entidad, setEntidad] = useState("contacto");
  const [f, setF] = useState({
    clave: "",
    etiqueta: "",
    tipo: "texto",
    obligatorio: false,
    opciones: "",
  });
  const cargar = () =>
    fetch(`/api/campos-personalizados?entidad=${entidad}`)
      .then((r) => r.json())
      .then((d) => setCampos(d.campos ?? []));
  useEffect(() => {
    void fetch(`/api/campos-personalizados?entidad=${entidad}`)
      .then((r) => r.json())
      .then((d) => setCampos(d.campos ?? []));
  }, [entidad]);
  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (
      await api("/api/campos-personalizados", "POST", {
        ...f,
        entidad,
        opciones: f.tipo === "opcion"
          ? f.opciones.split(",").map((opcion) => opcion.trim()).filter(Boolean)
          : [],
      })
    ) {
      setF({
        clave: "",
        etiqueta: "",
        tipo: "texto",
        obligatorio: false,
        opciones: "",
      });
      cargar();
    }
  }
  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        <p className="font-semibold">¿Para qué sirven?</p>
        <p className="mt-1">
          Agregan datos propios del negocio sin programar: por ejemplo tipo de
          tratamiento, presupuesto, zona de interés o vehículo buscado. Aparecen
          en la ficha, Chat, oportunidades, tabla de Contactos y archivos CSV.
        </p>
        <p className="mt-2 text-xs">
          La clave es interna y no cambia; la etiqueta es el nombre que verá el equipo.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          className="rounded-lg border px-3 py-2 text-sm"
          onClick={() => setEntidad("contacto")}
        >
          Contactos
        </button>
        <button
          className="rounded-lg border px-3 py-2 text-sm"
          onClick={() => setEntidad("oportunidad")}
        >
          Oportunidades
        </button>
      </div>
      <form
        onSubmit={crear}
        className="grid gap-2 rounded-xl border border-border bg-card p-4 sm:grid-cols-2"
      >
        <Campo
          label="Clave"
          value={f.clave}
          onChange={(e) =>
            setF({
              ...f,
              clave: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""),
            })
          }
          required
        />
        <Campo
          label="Etiqueta"
          value={f.etiqueta}
          onChange={(e) => setF({ ...f, etiqueta: e.target.value })}
          required
        />
        <select
          value={f.tipo}
          onChange={(e) => setF({ ...f, tipo: e.target.value })}
          className="rounded-lg border border-input px-3 py-2 text-sm"
        >
          <option value="texto">Texto</option>
          <option value="numero">Número</option>
          <option value="fecha">Fecha</option>
          <option value="opcion">Opción</option>
          <option value="si_no">Sí / no</option>
        </select>
        {f.tipo === "opcion" && (
          <Campo
            label="Opciones separadas por coma"
            value={f.opciones}
            onChange={(e) => setF({ ...f, opciones: e.target.value })}
            placeholder="Casa, Departamento, Terreno"
            required
          />
        )}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={f.obligatorio}
            onChange={(e) => setF({ ...f, obligatorio: e.target.checked })}
          />{" "}
          Obligatorio
        </label>
        <Boton type="submit">Crear campo</Boton>
      </form>
      <div className="space-y-2">
        {campos.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between rounded-lg border border-border p-3 text-sm"
          >
            <span>
              {c.etiqueta}{" "}
              <span className="text-xs text-muted-foreground">({c.tipo})</span>
            </span>
            <button
              className="text-xs text-primary"
              onClick={async () => {
                await api(`/api/campos-personalizados/${c.id}`, "PATCH", {
                  activo: !c.activo,
                });
                cargar();
              }}
            >
              {c.activo ? "Desactivar" : "Activar"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TabClientes({
  orgs,
  modulosPorOrg,
  modulos,
}: {
  orgs: any[];
  modulosPorOrg: Record<string, any[]>;
  modulos: any[];
}) {
  const router = useRouter();
  const vacio = {
    nombre: "",
    slug: "",
    adminNombre: "",
    adminEmail: "",
    adminPassword: "",
  };
  const [f, setF] = useState(vacio);
  const [slugTocado, setSlugTocado] = useState(false);
  const [creando, setCreando] = useState(false);
  const [creado, setCreado] = useState<{ slug: string; email: string } | null>(
    null,
  );
  const [modulosActivos, setModulosActivos] = useState(modulosPorOrg);

  function setNombre(nombre: string) {
    setF((prev) => ({
      ...prev,
      nombre,
      slug: slugTocado ? prev.slug : slugificar(nombre),
    }));
  }
  async function toggleModulo(orgId: string, clave: string, activo: boolean) {
    const ok = await api("/api/modulos", "POST", { orgId, clave, activo });
    if (ok)
      setModulosActivos((prev) => ({
        ...prev,
        [orgId]: [
          ...(prev[orgId] ?? []).filter((m) => m.clave !== clave),
          { clave, activo },
        ],
      }));
  }

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    setCreando(true);
    const ok = await api("/api/orgs", "POST", f);
    setCreando(false);
    if (ok) {
      setCreado({ slug: f.slug, email: f.adminEmail });
      toast(`Cliente "${f.nombre}" creado`);
      setF(vacio);
      setSlugTocado(false);
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-amber-50/60 p-3 text-xs text-muted-foreground">
        Cada cliente es una <b>organización aislada</b>: sus chats, contactos y
        usuarios no se mezclan con los de nadie más. Al crearla se genera su
        admin, su embudo de ventas y su canal oficial de WhatsApp mediante Meta
        Embedded Signup.
      </div>

      <form
        onSubmit={crear}
        className="space-y-4 rounded-xl border border-border bg-card p-4"
      >
        <p className="font-medium text-foreground">Nuevo cliente de Ámbar CRM</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            label="Nombre del negocio"
            value={f.nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Clínica X"
            required
          />
          <Campo
            label="Slug (identificador para entrar)"
            value={f.slug}
            onChange={(e) => {
              setSlugTocado(true);
              setF({ ...f, slug: slugificar(e.target.value) });
            }}
            placeholder="clinica-x"
            required
          />
          <Campo
            label="Nombre del admin"
            value={f.adminNombre}
            onChange={(e) => setF({ ...f, adminNombre: e.target.value })}
            placeholder="Dueño"
          />
          <Campo
            label="Email del admin"
            type="email"
            value={f.adminEmail}
            onChange={(e) => setF({ ...f, adminEmail: e.target.value })}
            required
          />
          <Campo
            label="Contraseña del admin (mín. 8)"
            type="text"
            value={f.adminPassword}
            onChange={(e) => setF({ ...f, adminPassword: e.target.value })}
            minLength={8}
            required
          />
        </div>
        <Boton type="submit" disabled={creando}>
          {creando ? "Creando…" : "Crear cliente"}
        </Boton>
      </form>

      {creado && (
        <div className="space-y-2 rounded-xl border border-green-200 bg-green-50 p-4">
          <p className="flex items-center gap-2 font-medium text-green-800">
            ✓ Cliente creado
          </p>
          <p className="text-sm text-green-900">
            Comparte esta liga de acceso junto con el usuario{" "}
            <b>{creado.email}</b> y su contraseña:
          </p>
          <div className="flex items-center gap-2">
            <code
              className={[
                "min-w-0 flex-1 truncate rounded-lg border border-green-200",
                "bg-card px-3 py-2 text-xs text-foreground",
              ].join(" ")}
            >
              {typeof window !== "undefined" ? location.origin : ""}/login?org=
              {creado.slug}
            </code>
            <Boton
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(
                  `${location.origin}/login?org=${creado.slug}`,
                );
                toast("Liga copiada");
              }}
            >
              Copiar
            </Boton>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-2">Cliente</th>
              <th className="px-4 py-2">Slug</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">Módulos</th>
              <th className="px-4 py-2">Soporte</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr
                key={o.id}
                className="border-b border-border/60 last:border-0"
              >
                <td className="px-4 py-2 font-medium text-foreground">
                  {o.nombre}
                  {String(o.id) === "1" && (
                    <span className="ml-2 text-[10px] text-muted-foreground">
                      (plataforma)
                    </span>
                  )}
                </td>
                <td className="px-4 py-2 text-muted-foreground">{o.slug}</td>
                <td className="px-4 py-2">
                  <span
                    className={[
                      "rounded-full px-2 py-0.5 text-xs",
                      o.activo
                        ? "bg-green-100 text-green-700"
                        : "bg-muted text-muted-foreground",
                    ].join(" ")}
                  >
                    {o.activo ? "Activa" : "Inactiva"}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-2">
                    {modulos.map((m) => {
                      const activo = (modulosActivos[String(o.id)] ?? []).some(
                        (x) => x.clave === m.clave && x.activo,
                      );
                      return (
                        <label
                          key={m.clave}
                          className="flex items-center gap-1 text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={activo}
                            onChange={(e) =>
                              toggleModulo(
                                String(o.id),
                                m.clave,
                                e.target.checked,
                              )
                            }
                          />{" "}
                          {m.nombre}
                        </label>
                      );
                    })}
                  </div>
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-col items-start gap-1">
                    <Link
                      href={`/configuracion/clientes/${o.id}`}
                      className="text-xs font-medium text-primary underline"
                    >
                      Ver detalles
                    </Link>
                    <a
                      href={`/login?org=${o.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary underline"
                    >
                      Abrir acceso
                    </a>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `${location.origin}/login?org=${o.slug}`,
                        );
                        toast("Liga copiada");
                      }}
                    >
                      Copiar liga
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TabIA({ ajustes }: { ajustes: any }) {
  const router = useRouter();
  const [f, setF] = useState({
    nombreNegocio: ajustes?.nombreNegocio ?? "",
    iaPromptSistema: ajustes?.iaPromptSistema ?? "",
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
      <div className="rounded-xl border border-border bg-amber-50/60 p-3 text-xs text-muted-foreground">
        La IA usa el modelo <b>Claude Haiku</b> para sugerir respuestas.
        Configura el contexto de tu negocio aquí para que las sugerencias sean
        más precisas y con el tono correcto.
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-foreground">
            Nombre del negocio
          </span>
          <input
            value={f.nombreNegocio}
            onChange={(e) => setF({ ...f, nombreNegocio: e.target.value })}
            placeholder="Ej: Clínica Serénica, Pie Feliz Podología…"
            className={[
              "w-full rounded-lg border border-input px-3 py-2 text-sm",
              "outline-none focus:ring-2 focus:ring-primary/30",
            ].join(" ")}
          />
          <span className="text-xs text-muted-foreground">
            Se incluye en el contexto de la IA (&quot;Trabajas para X&quot;).
          </span>
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-foreground">
            Instrucciones de la IA (prompt de sistema)
          </span>
          <textarea
            value={f.iaPromptSistema}
            onChange={(e) => setF({ ...f, iaPromptSistema: e.target.value })}
            rows={5}
            placeholder={
              "Eres un asistente de atención al cliente por WhatsApp. " +
              "Redacta la siguiente respuesta del agente: breve, cordial, en español neutro, lista para enviar. " +
              "Devuelve SOLO el texto, sin comillas ni explicaciones."
            }
            className={[
              "w-full rounded-lg border border-input px-3 py-2 text-sm",
              "outline-none focus:ring-2 focus:ring-primary/30",
            ].join(" ")}
          />
          <span className="text-xs text-muted-foreground">
            Si lo dejas vacío se usa el prompt por defecto. Personaliza el tono,
            la personalidad o las instrucciones del agente.
          </span>
        </label>

        <Boton onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar"}
        </Boton>
      </div>
    </div>
  );
}

function TabBots({ bots, canales }: { bots: any[]; canales: any[] }) {
  const router = useRouter();
  const [f, setF] = useState({ nombre: "", webhookUrl: "", canalId: "" });
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://crm.tudominio.com";

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (!f.nombre.trim() || !f.webhookUrl.trim()) return;
    if (await api("/api/bots", "POST", { ...f, canalId: f.canalId || null })) {
      setF({ nombre: "", webhookUrl: "", canalId: "" });
      router.refresh();
    }
  }
  async function toggle(b: any) {
    if (await api(`/api/bots/${b.id}`, "PATCH", { activo: !b.activo }))
      router.refresh();
  }
  async function regenerar(b: any) {
    if (!confirm("¿Regenerar el token? El valor anterior dejará de funcionar."))
      return;
    if (await api(`/api/bots/${b.id}`, "PATCH", { regenerarToken: true }))
      router.refresh();
  }
  async function borrar(b: any) {
    if (!confirm(`¿Borrar el bot "${b.nombre}"?`)) return;
    if (await api(`/api/bots/${b.id}`, "DELETE")) router.refresh();
  }

  return (
    <div className="max-w-2xl space-y-5">
      <form
        onSubmit={crear}
        className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2"
      >
        <Campo
          label="Nombre del bot"
          value={f.nombre}
          onChange={(e) => setF({ ...f, nombre: e.target.value })}
          required
        />
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted-foreground">
            Canal
          </span>
          <select
            value={f.canalId}
            onChange={(e) => setF({ ...f, canalId: e.target.value })}
            className="w-full rounded-lg border border-input px-3 py-2 text-sm"
          >
            <option value="">Todos los canales</option>
            {canales.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        <div className="sm:col-span-2">
          <Campo
            label="Webhook URL (nodo Webhook de n8n)"
            value={f.webhookUrl}
            onChange={(e) => setF({ ...f, webhookUrl: e.target.value })}
            placeholder="https://n8n.tudominio.com/webhook/bot-x"
            required
          />
        </div>
        <div className="sm:col-span-2">
          <Boton type="submit">+ Crear bot</Boton>
        </div>
      </form>

      <div className="space-y-3">
        {bots.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Sin bots configurados.
          </p>
        )}
        {bots.map((b) => (
          <div
            key={b.id}
            className="space-y-2 rounded-xl border border-border bg-card p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-foreground">{b.nombre}</p>
                <p className="text-xs text-muted-foreground">
                  {b.canal?.nombre ?? "Todos los canales"}
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <button
                  onClick={() => toggle(b)}
                  className={
                    b.activo ? "text-green-600" : "text-muted-foreground"
                  }
                >
                  {b.activo ? "● Activo" : "○ Inactivo"}
                </button>
                <button
                  onClick={() => borrar(b)}
                  className="text-red-600 hover:underline"
                >
                  Borrar
                </button>
              </div>
            </div>

            <div className="rounded-lg bg-background p-3 text-xs">
              <p className="text-muted-foreground">Webhook (CRM → n8n):</p>
              <code className="block break-all text-foreground">
                {b.webhookUrl}
              </code>
            </div>

            <div className="rounded-lg bg-background p-3 text-xs">
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground">
                  Token (header <code>api_access_token</code>):
                </p>
                <button
                  onClick={() => regenerar(b)}
                  className="text-primary hover:underline"
                >
                  Regenerar
                </button>
              </div>
              <code className="block break-all text-foreground">
                {b.apiToken}
              </code>
            </div>

            <div className="rounded-lg bg-background p-3 text-xs">
              <p className="text-muted-foreground">
                Endpoint para responder desde n8n:
              </p>
              <code className="block break-all text-foreground">
                POST {origin}
                /api/v1/accounts/1/conversations/&#123;&#123;conversationId&#125;&#125;/messages
              </code>
              <p className="mt-1 text-muted-foreground">
                Handoff (ceder a humano): manda la etiqueta{" "}
                <code>escalado_humano</code> a:
              </p>
              <code className="block break-all text-foreground">
                POST {origin}
                /api/v1/accounts/1/conversations/&#123;&#123;conversationId&#125;&#125;/labels
              </code>
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
    autoResolverHoras: ajustes?.autoResolverHoras ?? 24,
  });
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    const ok = await api("/api/ajustes", "PATCH", {
      ...f,
      autoResolverHoras: Number(f.autoResolverHoras) || 24,
    });
    setGuardando(false);
    if (ok) router.refresh();
  }

  return (
    <div className="max-w-lg space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={f.autoAsignar}
            onChange={(e) => setF({ ...f, autoAsignar: e.target.checked })}
            className="mt-1 h-4 w-4 accent-primary"
          />
          <span>
            <span className="block text-sm font-medium text-foreground">
              Auto-asignar leads nuevos
            </span>
            <span className="block text-xs text-muted-foreground">
              Al entrar un WhatsApp de un número nuevo, lo asigna al agente
              activo con menos conversaciones (reparto parejo).
            </span>
          </span>
        </label>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={f.crearLeadAuto}
            onChange={(e) => setF({ ...f, crearLeadAuto: e.target.checked })}
            className="mt-1 h-4 w-4 accent-primary"
          />
          <span>
            <span className="block text-sm font-medium text-foreground">
              Crear lead en el embudo automáticamente
            </span>
            <span className="block text-xs text-muted-foreground">
              Cada contacto nuevo entra como oportunidad en la primera etapa del
              embudo principal. El bot o el agente lo van moviendo.
            </span>
          </span>
        </label>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={f.bienvenidaActiva}
            onChange={(e) => setF({ ...f, bienvenidaActiva: e.target.checked })}
            className="mt-1 h-4 w-4 accent-primary"
          />
          <span>
            <span className="block text-sm font-medium text-foreground">
              Mensaje de bienvenida automático
            </span>
            <span className="block text-xs text-muted-foreground">
              Se envía solo la primera vez que un contacto escribe.
            </span>
          </span>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted-foreground">
            Texto de bienvenida
          </span>
          <textarea
            value={f.bienvenidaTexto}
            onChange={(e) => setF({ ...f, bienvenidaTexto: e.target.value })}
            rows={3}
            disabled={!f.bienvenidaActiva}
            className={[
              "w-full rounded-lg border border-input px-3 py-2 text-sm",
              "outline-none focus:ring-2 focus:ring-primary/30",
              "disabled:bg-muted",
            ].join(" ")}
          />
          <span className="text-xs text-muted-foreground">
            Variables: {"{{nombre}}"}, {"{{nombre_completo}}"}, {"{{telefono}}"}
            .
          </span>
        </label>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={f.csatActivo}
            onChange={(e) => setF({ ...f, csatActivo: e.target.checked })}
            className="mt-1 h-4 w-4 accent-primary"
          />
          <span>
            <span className="block text-sm font-medium text-foreground">
              Encuesta de satisfacción (CSAT)
            </span>
            <span className="block text-xs text-muted-foreground">
              Al cerrar una conversación se manda una pregunta 1-5 y se guarda
              la respuesta del cliente.
            </span>
          </span>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted-foreground">
            Texto de la encuesta
          </span>
          <textarea
            value={f.csatTexto}
            onChange={(e) => setF({ ...f, csatTexto: e.target.value })}
            rows={2}
            disabled={!f.csatActivo}
            placeholder="¿Cómo calificarías nuestra atención del 1 al 5? Responde solo con el número 🙏"
            className={[
              "w-full rounded-lg border border-input px-3 py-2 text-sm",
              "outline-none focus:ring-2 focus:ring-primary/30",
              "disabled:bg-muted",
            ].join(" ")}
          />
        </label>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={f.horarioActivo}
            onChange={(e) => setF({ ...f, horarioActivo: e.target.checked })}
            className="mt-1 h-4 w-4 accent-primary"
          />
          <span>
            <span className="block text-sm font-medium text-foreground">
              Mensaje fuera de horario
            </span>
            <span className="block text-xs text-muted-foreground">
              Si entra un mensaje fuera del horario de atención, se responde
              automáticamente (máx. una vez cada 4 h por chat).
            </span>
          </span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Desde
            </span>
            <input
              type="time"
              value={f.horarioInicio}
              onChange={(e) => setF({ ...f, horarioInicio: e.target.value })}
              disabled={!f.horarioActivo}
              className="w-full rounded-lg border border-input px-3 py-2 text-sm disabled:bg-muted"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              Hasta
            </span>
            <input
              type="time"
              value={f.horarioFin}
              onChange={(e) => setF({ ...f, horarioFin: e.target.value })}
              disabled={!f.horarioActivo}
              className="w-full rounded-lg border border-input px-3 py-2 text-sm disabled:bg-muted"
            />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            Días hábiles (1=lunes … 7=domingo)
          </span>
          <input
            value={f.horarioDias}
            onChange={(e) => setF({ ...f, horarioDias: e.target.value })}
            disabled={!f.horarioActivo}
            placeholder="1,2,3,4,5"
            className="w-full rounded-lg border border-input px-3 py-2 text-sm disabled:bg-muted"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted-foreground">
            Texto fuera de horario
          </span>
          <textarea
            value={f.fueraHorarioTexto}
            onChange={(e) => setF({ ...f, fueraHorarioTexto: e.target.value })}
            rows={2}
            disabled={!f.horarioActivo}
            placeholder="¡Gracias por escribir! Nuestro horario es de 9 a 18 h. Te respondemos en cuanto abramos 🙌"
            className={[
              "w-full rounded-lg border border-input px-3 py-2 text-sm",
              "outline-none focus:ring-2 focus:ring-primary/30",
              "disabled:bg-muted",
            ].join(" ")}
          />
        </label>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={f.autoResolverActivo}
            onChange={(e) =>
              setF({ ...f, autoResolverActivo: e.target.checked })
            }
            className="mt-1 h-4 w-4 accent-primary"
          />
          <span>
            <span className="block text-sm font-medium text-foreground">
              Auto-resolver chats inactivos
            </span>
            <span className="block text-xs text-muted-foreground">
              Cierra conversaciones sin actividad. Requiere llamar al endpoint
              cron desde n8n (ver INTEGRACION-BOTS.md).
            </span>
          </span>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            Cerrar tras (horas sin actividad)
          </span>
          <input
            type="number"
            min={1}
            value={f.autoResolverHoras}
            onChange={(e) =>
              setF({ ...f, autoResolverHoras: e.target.value as any })
            }
            disabled={!f.autoResolverActivo}
            className="w-32 rounded-lg border border-input px-3 py-2 text-sm disabled:bg-muted"
          />
        </label>
      </div>

      <Boton onClick={guardar} disabled={guardando}>
        {guardando ? "Guardando…" : "Guardar"}
      </Boton>
    </div>
  );
}

function TabEmbudos({ embudos }: { embudos: any[] }) {
  const router = useRouter();
  const [nuevo, setNuevo] = useState("");
  const [etapaForm, setEtapaForm] = useState<
    Record<string, { nombre: string; tipo: string }>
  >({});

  async function crearEmbudo() {
    if (!nuevo.trim()) return;
    if (await api("/api/embudos", "POST", { nombre: nuevo })) {
      setNuevo("");
      router.refresh();
    }
  }
  async function borrarEmbudo(id: string) {
    if (!confirm("¿Borrar embudo y todas sus etapas/oportunidades?")) return;
    if (await api(`/api/embudos/${id}`, "DELETE")) router.refresh();
  }
  async function crearEtapa(embudoId: string) {
    const f = etapaForm[embudoId];
    if (!f?.nombre?.trim()) return;
    if (
      await api("/api/etapas", "POST", {
        embudoId,
        nombre: f.nombre,
        tipo: f.tipo || "normal",
      })
    ) {
      setEtapaForm((p) => ({
        ...p,
        [embudoId]: { nombre: "", tipo: "normal" },
      }));
      router.refresh();
    }
  }
  async function borrarEtapa(id: string) {
    if (await api(`/api/etapas/${id}`, "DELETE")) router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          placeholder="Nombre del embudo"
          className="rounded-lg border border-input px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
        />
        <Boton onClick={crearEmbudo}>+ Embudo</Boton>
      </div>

      {embudos.map((e) => (
        <div key={e.id} className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-foreground">{e.nombre}</h3>
            <button
              onClick={() => borrarEmbudo(e.id)}
              className="text-xs text-red-600 hover:underline"
            >
              Borrar embudo
            </button>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            {e.etapas.map((et: any) => (
              <span
                key={et.id}
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-white"
                style={{ background: et.color }}
              >
                {et.nombre}
                <button
                  onClick={() => borrarEtapa(et.id)}
                  className="ml-1 opacity-80 hover:opacity-100"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={etapaForm[e.id]?.nombre ?? ""}
              onChange={(ev) =>
                setEtapaForm((p) => ({
                  ...p,
                  [e.id]: {
                    ...(p[e.id] ?? { tipo: "normal" }),
                    nombre: ev.target.value,
                  },
                }))
              }
              placeholder="Nueva etapa"
              className={[
                "rounded-lg border border-input px-3 py-1.5 text-sm",
                "outline-none focus:ring-2 focus:ring-primary/30",
              ].join(" ")}
            />
            <select
              value={etapaForm[e.id]?.tipo ?? "normal"}
              onChange={(ev) =>
                setEtapaForm((p) => ({
                  ...p,
                  [e.id]: {
                    ...(p[e.id] ?? { nombre: "" }),
                    tipo: ev.target.value,
                  },
                }))
              }
              className="rounded-lg border border-input px-2 py-1.5 text-sm"
            >
              <option value="normal">Normal</option>
              <option value="ganado">Ganado</option>
              <option value="perdido">Perdido</option>
            </select>
            <Boton variante="ghost" onClick={() => crearEtapa(e.id)}>
              + Etapa
            </Boton>
          </div>
        </div>
      ))}
    </div>
  );
}

function TabUsuarios({ usuarios }: { usuarios: any[] }) {
  const router = useRouter();
  const [form, setForm] = useState({
    nombre: "",
    email: "",
    password: "",
    rol: "agente",
    puesto: "Agente",
  });

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (await api("/api/usuarios", "POST", form)) {
      setForm({
        nombre: "",
        email: "",
        password: "",
        rol: "agente",
        puesto: "Agente",
      });
      router.refresh();
    }
  }
  async function toggleActivo(u: any) {
    if (await api(`/api/usuarios/${u.id}`, "PATCH", { activo: !u.activo }))
      router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        Invita al equipo creando su acceso. El <b>puesto</b> describe su función
        —recepcionista, doctor o vendedor— y el <b>rol</b> define permisos:
        Admin configura el CRM; Agente trabaja la operación diaria.
      </div>
      <form
        onSubmit={crear}
        className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2"
      >
        <Campo
          label="Nombre"
          value={form.nombre}
          onChange={(e) => setForm({ ...form, nombre: e.target.value })}
          required
        />
        <Campo
          label="Email"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />
        <Campo
          label="Contraseña"
          type="text"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
        />
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted-foreground">Rol</span>
          <select
            value={form.rol}
            onChange={(e) => setForm({ ...form, rol: e.target.value })}
            className="w-full rounded-lg border border-input px-3 py-2 text-sm"
          >
            <option value="agente">Agente</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted-foreground">Puesto</span>
          <select
            value={form.puesto}
            onChange={(e) => setForm({ ...form, puesto: e.target.value })}
            className="w-full rounded-lg border border-input px-3 py-2 text-sm"
          >
            <option>Agente</option>
            <option>Recepcionista</option>
            <option>Doctor</option>
            <option>Especialista</option>
            <option>Vendedor</option>
            <option>Asesor inmobiliario</option>
            <option>Asesor automotriz</option>
          </select>
        </label>
        <div className="sm:col-span-2">
          <Boton type="submit">+ Invitar integrante</Boton>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-background text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Puesto</th>
              <th className="px-4 py-3">Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className="border-t border-border/60">
                <td className="px-4 py-3 font-medium text-foreground">
                  {u.nombre}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-3 capitalize text-muted-foreground">
                  {u.rol}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{u.puesto}</td>
                <td className="px-4 py-3">
                  {u.activo ? "Activo" : "Inactivo"}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => toggleActivo(u)}
                    className="text-primary hover:underline"
                  >
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

const TabCanal = MetaCanales;

function TabPlantillas({ plantillas }: { plantillas: any[] }) {
  const router = useRouter();
  const [f, setF] = useState({ nombre: "", contenido: "" });

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (await api("/api/plantillas", "POST", f)) {
      setF({ nombre: "", contenido: "" });
      router.refresh();
    }
  }
  async function borrar(id: string) {
    if (await api(`/api/plantillas/${id}`, "DELETE")) router.refresh();
  }

  return (
    <div className="space-y-5">
      <form
        onSubmit={crear}
        className="space-y-3 rounded-xl border border-border bg-card p-4"
      >
        <Campo
          label="Nombre"
          value={f.nombre}
          onChange={(e) => setF({ ...f, nombre: e.target.value })}
          required
        />
        <label className="block space-y-1">
          <span className="text-sm font-medium text-muted-foreground">
            Contenido
          </span>
          <textarea
            value={f.contenido}
            onChange={(e) => setF({ ...f, contenido: e.target.value })}
            rows={3}
            required
            className={[
              "w-full rounded-lg border border-input px-3 py-2 text-sm",
              "outline-none focus:ring-2 focus:ring-primary/30",
            ].join(" ")}
          />
        </label>
        <Boton type="submit">+ Crear plantilla</Boton>
      </form>

      <div className="space-y-2">
        {plantillas.map((p) => (
          <div
            key={p.id}
            className="flex items-start justify-between rounded-xl border border-border bg-card p-3"
          >
            <div>
              <p className="text-sm font-medium text-foreground">{p.nombre}</p>
              <p className="text-sm text-muted-foreground">{p.contenido}</p>
            </div>
            <button
              onClick={() => borrar(p.id)}
              className="text-xs text-red-600 hover:underline"
            >
              Borrar
            </button>
          </div>
        ))}
        {plantillas.length === 0 && (
          <p className="text-sm text-muted-foreground">Sin plantillas.</p>
        )}
      </div>
    </div>
  );
}
