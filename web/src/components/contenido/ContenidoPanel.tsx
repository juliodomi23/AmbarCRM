"use client";

import { useMemo, useState } from "react";
import { Badge, Boton, Campo, Modal, Selector, tonoEstado } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import {
  CANALES_CONTENIDO, ESTADOS_CONTENIDO, FORMATOS_CONTENIDO,
  etiquetaCanal, etiquetaEstadoContenido, etiquetaFormato, puedeAprobar, puedeEditarPieza,
  semanaDe, transicionContenidoValida,
} from "@/lib/contenido";

type Comentario = { id: string; texto: string; tipo: string; creadoAt: string };
type Pieza = {
  id: string; titulo: string; copy: string; canal: string; formato: string; estado: string;
  fechaPublicacion: string | null; publicadaAt: string | null; enlaceMaterial: string | null;
  notasDiseno: string | null; redactorId: string | null; revisorId: string | null;
  redactorNombre?: string | null; revisorNombre?: string | null; campanaId: string | null; contactoId: string | null;
  version: number; comentarios: Comentario[]; _count?: { comentarios: number };
};
type Opcion = { id: string; nombre: string };

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const VISTAS: Record<string, string> = { semana: "Semana", tablero: "Tablero", revision: "Revisión", piezas: "Piezas" };

function claveDia(valor: string | null) {
  if (!valor) return null;
  return new Date(valor).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
}

function fechaHora(valor: string | null) {
  if (!valor) return "Sin fecha";
  return new Date(valor).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Mexico_City" });
}

function aInputFecha(valor: string | null) {
  if (!valor) return "";
  return new Date(valor).toISOString().slice(0, 16);
}

export function ContenidoPanel({
  vista, iniciales, usuarios, campanas, contactos, usuarioId, puesto, rol, semanaInicial,
}: {
  vista: "semana" | "tablero" | "revision" | "piezas";
  iniciales: Pieza[];
  usuarios: Opcion[];
  campanas: Opcion[];
  contactos: Opcion[];
  usuarioId: string | null;
  puesto: string;
  rol: string;
  semanaInicial: string;
}) {
  const [piezas, setPiezas] = useState(iniciales);
  const [semana, setSemana] = useState(semanaInicial);
  const [canal, setCanal] = useState("");
  const [seleccionada, setSeleccionada] = useState<Pieza | null>(null);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [form, setForm] = useState({ titulo: "", canal: "instagram", formato: "imagen", campanaId: "", contactoId: "", redactorId: usuarioId ?? "", revisorId: "", fechaPublicacion: "", copy: "", enlaceMaterial: "", notasDiseno: "" });

  const filtradas = useMemo(() => {
    let lista = piezas;
    if (canal) lista = lista.filter((pieza) => pieza.canal === canal);
    if (vista === "revision") lista = lista.filter((pieza) => ["revision", "cambios"].includes(pieza.estado));
    if (vista === "semana") {
      const { inicio, fin } = semanaDe(semana);
      lista = lista.filter((pieza) => {
        const clave = claveDia(pieza.fechaPublicacion);
        return clave !== null && clave >= inicio && clave <= fin;
      });
    }
    return lista;
  }, [piezas, canal, vista, semana]);

  const pendientes = piezas.filter((pieza) => ["revision", "cambios"].includes(pieza.estado)).length;

  async function recargar() {
    const respuesta = await fetch("/api/contenido/piezas", { cache: "no-store" });
    const datos = await respuesta.json().catch(() => ({}));
    if (respuesta.ok) setPiezas(datos.piezas);
  }

  async function crear(evento: React.FormEvent) {
    evento.preventDefault();
    setError("");
    const respuesta = await fetch("/api/contenido/piezas", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) { setError(datos.error ?? "No se pudo crear la pieza"); return; }
    setPiezas((lista) => [{ ...datos.pieza, comentarios: [], _count: { comentarios: 0 } }, ...lista]);
    setCreando(false);
    setForm({ titulo: "", canal: "instagram", formato: "imagen", campanaId: "", contactoId: "", redactorId: usuarioId ?? "", revisorId: "", fechaPublicacion: "", copy: "", enlaceMaterial: "", notasDiseno: "" });
  }

  async function guardar(pieza: Pieza, cambios: Record<string, unknown>) {
    setError(""); setAviso("");
    const respuesta = await fetch(`/api/contenido/piezas/${pieza.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: pieza.version, ...cambios }),
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) { setError(datos.error ?? "No se pudo guardar la pieza"); return false; }
    setPiezas((lista) => lista.map((item) => item.id === pieza.id ? datos.pieza : item));
    setSeleccionada(datos.pieza);
    setAviso("Pieza actualizada");
    return true;
  }

  async function comentar(pieza: Pieza, texto: string, tipo: string) {
    if (!texto.trim()) return;
    const respuesta = await fetch(`/api/contenido/piezas/${pieza.id}/comentarios`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto, tipo }),
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) { setError(datos.error ?? "No se pudo comentar"); return; }
    const actualizada = { ...pieza, estado: datos.estado, comentarios: [...pieza.comentarios, datos.comentario], version: pieza.version + (datos.estado !== pieza.estado ? 1 : 0) };
    setPiezas((lista) => lista.map((item) => item.id === pieza.id ? actualizada : item));
    setSeleccionada(actualizada);
  }

  const puedeEditar = seleccionada ? puedeEditarPieza(seleccionada, usuarioId, puesto, rol) : false;
  const puedeAprobarEsta = seleccionada ? puedeAprobar(seleccionada, usuarioId, puesto, rol) : false;
  const siguientes = seleccionada
    ? ESTADOS_CONTENIDO.filter((estado) => estado !== seleccionada.estado && transicionContenidoValida(seleccionada.estado, estado) && (estado !== "aprobado" || puedeAprobarEsta))
    : [];

  function tarjeta(pieza: Pieza) {
    return (
      <button key={pieza.id} type="button" onClick={() => setSeleccionada(pieza)} className="surface surface-interactiva w-full space-y-2.5 p-4 text-left sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 min-w-0 font-semibold leading-snug text-foreground">{pieza.titulo}</p>
          <Badge tono={tonoEstado(pieza.estado)} punto className="shrink-0">{etiquetaEstadoContenido(pieza.estado)}</Badge>
        </div>
        <p className="line-clamp-2 text-sm text-muted-foreground">{pieza.copy || "Sin copy todavía"}</p>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>{etiquetaCanal(pieza.canal)}</span><span aria-hidden="true">·</span><span>{etiquetaFormato(pieza.formato)}</span>
          <span aria-hidden="true">·</span><span>{fechaHora(pieza.fechaPublicacion)}</span>
        </div>
        {(pieza.revisorNombre || pieza.redactorNombre) && <p className="text-xs text-muted-foreground">Redacta {pieza.redactorNombre ?? "—"} · Revisa {pieza.revisorNombre ?? "—"}</p>}
      </button>
    );
  }

  return (
    <section className="space-y-5">
      <div className="surface flex flex-wrap items-end gap-3 p-4 sm:p-5">
        {vista === "semana" && <Campo label="Semana" type="date" value={semana} onChange={(e) => setSemana(e.target.value)} />}
        <Selector label="Canal" value={canal} onChange={(e) => setCanal(e.target.value)}>
          <option value="">Todos</option>
          {CANALES_CONTENIDO.map((valor) => <option key={valor} value={valor}>{etiquetaCanal(valor)}</option>)}
        </Selector>
        <Boton variante="ghost" onClick={() => void recargar()}>Actualizar</Boton>
        <Boton onClick={() => setCreando(true)}>Nueva pieza</Boton>
        <p className="w-full text-sm text-muted-foreground sm:ml-auto sm:w-auto">{VISTAS[vista]} · {filtradas.length} pieza(s){vista !== "revision" ? ` · ${pendientes} por revisar` : ""}</p>
      </div>

      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {aviso && <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{aviso}</p>}

      {filtradas.length === 0 ? (
        <EmptyState titulo="Sin piezas para mostrar" descripcion="Crea una pieza o cambia el filtro para ver el contenido." />
      ) : vista === "semana" ? (
        <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
          {DIAS.map((dia, indice) => {
            const { inicio } = semanaDe(semana);
            const clave = new Date(`${inicio}T00:00:00.000Z`);
            clave.setUTCDate(clave.getUTCDate() + indice);
            const fecha = clave.toISOString().slice(0, 10);
            const delDia = filtradas.filter((pieza) => claveDia(pieza.fechaPublicacion) === fecha);
            return (
              <div key={dia} className="space-y-2">
                <h2 className="border-b border-border/60 pb-1.5 text-sm font-semibold text-foreground">{dia} <span className="font-normal text-muted-foreground">{fecha.slice(5)}</span></h2>
                {delDia.length === 0 ? <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">Sin publicaciones</p> : delDia.map(tarjeta)}
              </div>
            );
          })}
        </div>
      ) : vista === "tablero" ? (
        <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">
          {ESTADOS_CONTENIDO.map((estado) => {
            const delEstado = filtradas.filter((pieza) => pieza.estado === estado);
            return (
              <div key={estado} className="space-y-2">
                <h2 className="flex items-center justify-between text-sm font-semibold text-foreground">{etiquetaEstadoContenido(estado)} <span className="text-xs font-normal text-muted-foreground">{delEstado.length}</span></h2>
                {delEstado.map(tarjeta)}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">{filtradas.map(tarjeta)}</div>
      )}

      <Modal abierto={creando} onClose={() => setCreando(false)} titulo="Nueva pieza de contenido">
        <form onSubmit={crear} className="space-y-3">
          <Campo label="Título" required value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Selector label="Canal" value={form.canal} onChange={(e) => setForm({ ...form, canal: e.target.value })}>
              {CANALES_CONTENIDO.map((valor) => <option key={valor} value={valor}>{etiquetaCanal(valor)}</option>)}
            </Selector>
            <Selector label="Formato" value={form.formato} onChange={(e) => setForm({ ...form, formato: e.target.value })}>
              {FORMATOS_CONTENIDO.map((valor) => <option key={valor} value={valor}>{etiquetaFormato(valor)}</option>)}
            </Selector>
            <Selector label="Campaña" value={form.campanaId} onChange={(e) => setForm({ ...form, campanaId: e.target.value })}>
              <option value="">Sin campaña</option>
              {campanas.map((campana) => <option key={campana.id} value={campana.id}>{campana.nombre}</option>)}
            </Selector>
            <Selector label="Contacto" value={form.contactoId} onChange={(e) => setForm({ ...form, contactoId: e.target.value })}>
              <option value="">Sin contacto</option>
              {contactos.map((contacto) => <option key={contacto.id} value={contacto.id}>{contacto.nombre}</option>)}
            </Selector>
            <Selector label="Redactor" value={form.redactorId} onChange={(e) => setForm({ ...form, redactorId: e.target.value })}>
              <option value="">Yo</option>
              {usuarios.map((usuario) => <option key={usuario.id} value={usuario.id}>{usuario.nombre}</option>)}
            </Selector>
            <Selector label="Revisor" value={form.revisorId} onChange={(e) => setForm({ ...form, revisorId: e.target.value })}>
              <option value="">Sin revisor</option>
              {usuarios.map((usuario) => <option key={usuario.id} value={usuario.id}>{usuario.nombre}</option>)}
            </Selector>
          </div>
          <Campo label="Fecha de publicación" type="datetime-local" value={form.fechaPublicacion} onChange={(e) => setForm({ ...form, fechaPublicacion: e.target.value })} />
          <label className="block space-y-1">
            <span className="text-sm font-medium text-muted-foreground">Copy</span>
            <textarea rows={4} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/30" value={form.copy} onChange={(e) => setForm({ ...form, copy: e.target.value })} />
          </label>
          <Campo label="Enlace del material (https)" value={form.enlaceMaterial} onChange={(e) => setForm({ ...form, enlaceMaterial: e.target.value })} />
          <Campo label="Notas de diseño" value={form.notasDiseno} onChange={(e) => setForm({ ...form, notasDiseno: e.target.value })} />
          <div className="flex justify-end gap-2"><Boton variante="ghost" type="button" onClick={() => setCreando(false)}>Cancelar</Boton><Boton type="submit">Crear pieza</Boton></div>
        </form>
      </Modal>

      <Modal abierto={seleccionada !== null} onClose={() => setSeleccionada(null)} titulo={seleccionada?.titulo ?? "Pieza"}>
        {seleccionada && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tono={tonoEstado(seleccionada.estado)} punto>{etiquetaEstadoContenido(seleccionada.estado)}</Badge>
              <span className="text-xs text-muted-foreground">{etiquetaCanal(seleccionada.canal)} · {etiquetaFormato(seleccionada.formato)}</span>
            </div>
            {puedeEditar ? (
              <form onSubmit={(evento) => { evento.preventDefault(); const datos = new FormData(evento.currentTarget); void guardar(seleccionada, { titulo: datos.get("titulo"), copy: datos.get("copy"), canal: datos.get("canal"), formato: datos.get("formato"), fechaPublicacion: datos.get("fechaPublicacion") || null, enlaceMaterial: datos.get("enlaceMaterial"), notasDiseno: datos.get("notasDiseno") }); }} className="space-y-3">
                <Campo label="Título" name="titulo" defaultValue={seleccionada.titulo} required />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Selector label="Canal" name="canal" defaultValue={seleccionada.canal}>
                    {CANALES_CONTENIDO.map((valor) => <option key={valor} value={valor}>{etiquetaCanal(valor)}</option>)}
                  </Selector>
                  <Selector label="Formato" name="formato" defaultValue={seleccionada.formato}>
                    {FORMATOS_CONTENIDO.map((valor) => <option key={valor} value={valor}>{etiquetaFormato(valor)}</option>)}
                  </Selector>
                </div>
                <Campo label="Fecha de publicación" name="fechaPublicacion" type="datetime-local" defaultValue={aInputFecha(seleccionada.fechaPublicacion)} />
                <label className="block space-y-1">
                  <span className="text-sm font-medium text-muted-foreground">Copy</span>
                  <textarea name="copy" rows={5} defaultValue={seleccionada.copy} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/30" />
                </label>
                <Campo label="Enlace del material" name="enlaceMaterial" defaultValue={seleccionada.enlaceMaterial ?? ""} />
                <Campo label="Notas de diseño" name="notasDiseno" defaultValue={seleccionada.notasDiseno ?? ""} />
                <Boton type="submit">Guardar cambios</Boton>
              </form>
            ) : (
              <div className="space-y-2 text-sm">
                <p className="whitespace-pre-wrap text-foreground">{seleccionada.copy || "Sin copy"}</p>
                <p className="text-muted-foreground">{fechaHora(seleccionada.fechaPublicacion)}</p>
              </div>
            )}

            {puedeEditar && siguientes.length > 0 && (
              <div className="flex flex-wrap gap-2 border-t border-border/70 pt-3">
                {siguientes.map((estado) => (
                  <Boton key={estado} variante={estado === "aprobado" || estado === "publicado" ? "primary" : "ghost"} onClick={() => void guardar(seleccionada, { estado })}>
                    {etiquetaEstadoContenido(estado)}
                  </Boton>
                ))}
              </div>
            )}

            <section className="space-y-2 border-t border-border/70 pt-3">
              <h3 className="text-sm font-semibold text-foreground">Comentarios ({seleccionada.comentarios.length})</h3>
              <div className="max-h-40 space-y-2 overflow-y-auto">
                {seleccionada.comentarios.length === 0 && <p className="text-sm text-muted-foreground">Sin comentarios.</p>}
                {seleccionada.comentarios.map((comentario) => (
                  <div key={comentario.id} className={`rounded-lg p-2 text-sm ${comentario.tipo === "cambio_solicitado" ? "bg-warning/10 text-warning" : "bg-muted/60 text-foreground"}`}>
                    <p className="whitespace-pre-wrap">{comentario.texto}</p>
                    <p className="mt-1 text-[11px] opacity-70">{fechaHora(comentario.creadoAt)}</p>
                  </div>
                ))}
              </div>
              {puedeEditar && <ComentarioForm onEnviar={(texto, tipo) => void comentar(seleccionada, texto, tipo)} />}
            </section>
          </div>
        )}
      </Modal>
    </section>
  );
}

function ComentarioForm({ onEnviar }: { onEnviar: (texto: string, tipo: string) => void }) {
  const [texto, setTexto] = useState("");
  const [tipo, setTipo] = useState("comentario");
  return (
    <form onSubmit={(evento) => { evento.preventDefault(); onEnviar(texto, tipo); setTexto(""); }} className="space-y-2">
      <textarea rows={2} className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/30" placeholder="Escribe un comentario…" value={texto} onChange={(e) => setTexto(e.target.value)} />
      <div className="flex flex-wrap items-center gap-2">
        <Selector label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="comentario">Comentario</option>
          <option value="cambio_solicitado">Solicitar cambio</option>
        </Selector>
        <Boton type="submit" className="mt-5">Enviar</Boton>
      </div>
    </form>
  );
}
