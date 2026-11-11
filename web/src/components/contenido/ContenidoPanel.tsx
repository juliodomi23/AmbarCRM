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
  version: number; updatedAt?: string; comentarios: Comentario[]; _count?: { comentarios: number };
};
type Opcion = { id: string; nombre: string };

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

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
  const partes = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(valor)).map((parte) => [parte.type, parte.value]));
  return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}`;
}

function fechaConZonaMexico(valor: string) {
  if (!valor) return null;
  const fechaUtc = new Date(`${valor}:00Z`);
  const partes = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(fechaUtc).map((parte) => [parte.type, parte.value]));
  const horaZonaComoUtc = Date.UTC(Number(partes.year), Number(partes.month) - 1, Number(partes.day), Number(partes.hour), Number(partes.minute), Number(partes.second));
  return new Date(fechaUtc.getTime() - (horaZonaComoUtc - fechaUtc.getTime())).toISOString();
}

function mesDia(fecha: string) { return new Date(`${fecha}T12:00:00Z`).toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", ""); }
function moverSemana(fecha: string, semanas: number) { const base = new Date(`${semanaDe(fecha).inicio}T12:00:00Z`); base.setUTCDate(base.getUTCDate() + semanas * 7); return base.toISOString().slice(0, 10); }
function etiquetaEspera(fecha?: string) { if (!fecha) return "Esperando revisión"; const dias = Math.max(0, Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000)); return dias === 0 ? "Esperando desde hoy" : `Esperando hace ${dias} día${dias === 1 ? "" : "s"}`; }

const TONO_CANAL: Record<string, string> = { instagram: "bg-primary/10 text-primary", facebook: "bg-info/10 text-info", linkedin: "bg-info/10 text-info", tiktok: "bg-foreground/10 text-foreground", whatsapp: "bg-success/10 text-success", blog: "bg-warning/10 text-warning", email: "bg-muted text-foreground", otro: "bg-muted text-foreground" };
const ICONO_ESTADO: Record<string, string> = { publicado: "✓", programado: "◷", revision: "◌", cambios: "!", aprobado: "✓", idea: "•", redaccion: "✎" };
const TONO_ESTADO: Record<string, string> = { publicado: "border-border bg-muted/50 text-muted-foreground", programado: "border-info/30 bg-info/10 text-info", revision: "border-warning/30 bg-warning/10 text-warning", cambios: "border-warning/30 bg-warning/10 text-warning", aprobado: "border-success/30 bg-success/10 text-success", idea: "border-border bg-muted text-foreground", redaccion: "border-primary/25 bg-primary/10 text-primary" };
const ICONO_CANAL: Record<string, string> = { instagram: "◎", facebook: "f", linkedin: "in", tiktok: "♪", whatsapp: "◉", blog: "✎", email: "✉", otro: "•" };

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
  const [trabajadorId, setTrabajadorId] = useState("");
  const [seleccionada, setSeleccionada] = useState<Pieza | null>(null);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [form, setForm] = useState({ titulo: "", canal: "instagram", formato: "imagen", campanaId: "", contactoId: "", redactorId: usuarioId ?? "", revisorId: "", fechaPublicacion: "", copy: "", enlaceMaterial: "", notasDiseno: "" });

  const filtradas = useMemo(() => {
    let lista = piezas;
    if (canal) lista = lista.filter((pieza) => pieza.canal === canal);
    if (trabajadorId) lista = lista.filter((pieza) => pieza.redactorId === trabajadorId || pieza.revisorId === trabajadorId);
    if (vista === "revision") lista = lista.filter((pieza) => ["revision", "cambios"].includes(pieza.estado));
    if (vista === "semana") {
      const { inicio, fin } = semanaDe(semana);
      lista = lista.filter((pieza) => {
        const clave = claveDia(pieza.fechaPublicacion);
        return clave !== null && clave >= inicio && clave <= fin;
      });
    }
    if (vista === "revision") lista = [...lista].sort((a, b) => (a.fechaPublicacion ?? "9999").localeCompare(b.fechaPublicacion ?? "9999"));
    return lista;
  }, [piezas, canal, trabajadorId, vista, semana]);

  const resumenPiezas = vista === "semana" ? filtradas : piezas;
  const resumenSemana = [
    { etiqueta: "publicadas", total: resumenPiezas.filter((pieza) => pieza.estado === "publicado").length, tono: "success" },
    { etiqueta: "programadas", total: resumenPiezas.filter((pieza) => pieza.estado === "programado").length, tono: "info" },
    { etiqueta: "por revisar", total: resumenPiezas.filter((pieza) => ["revision", "cambios"].includes(pieza.estado)).length, tono: "warning" },
  ];

  async function recargar() {
    const respuesta = await fetch("/api/contenido/piezas", { cache: "no-store" });
    const datos = await respuesta.json().catch(() => ({}));
    if (respuesta.ok) setPiezas(datos.piezas);
  }

  async function crear(evento: React.FormEvent) {
    evento.preventDefault();
    setError("");
    const respuesta = await fetch("/api/contenido/piezas", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, fechaPublicacion: fechaConZonaMexico(form.fechaPublicacion) }),
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
    const publicado = pieza.estado === "publicado";
    return (
      <button key={pieza.id} type="button" onClick={() => setSeleccionada(pieza)} aria-label={`Abrir ${pieza.titulo}, ${etiquetaEstadoContenido(pieza.estado)}`} className={`surface surface-interactiva w-full space-y-3 p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${publicado ? "opacity-70" : ""}`}>
        <div className="flex items-start justify-between gap-2">
          <p className="line-clamp-2 min-w-0 font-semibold leading-snug text-foreground">{pieza.titulo}</p>
          <span className={`inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold ${TONO_ESTADO[pieza.estado] ?? "border-border bg-muted text-foreground"}`}><span aria-hidden="true">{ICONO_ESTADO[pieza.estado] ?? "•"}</span>{etiquetaEstadoContenido(pieza.estado)}</span>
        </div>
        <p className="line-clamp-2 text-sm text-foreground/80">{pieza.copy || "Sin copy todavía"}</p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className={`inline-flex min-h-7 items-center gap-1.5 rounded-md px-2 font-medium ${TONO_CANAL[pieza.canal] ?? "bg-muted text-foreground"}`}><span aria-hidden="true" className="font-bold">{ICONO_CANAL[pieza.canal] ?? "•"}</span>{etiquetaCanal(pieza.canal)}</span><span className="text-muted-foreground">{etiquetaFormato(pieza.formato)}</span>
          {pieza.fechaPublicacion && <span className="ml-auto text-sm font-bold text-foreground">{new Date(pieza.fechaPublicacion).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" })}</span>}
        </div>
        {pieza.estado === "revision" || pieza.estado === "cambios" ? <p className="text-xs font-medium text-warning">{etiquetaEspera(pieza.updatedAt)}</p> : null}
        {(pieza.revisorNombre || pieza.redactorNombre) && <p className="text-xs text-muted-foreground">Redacta {pieza.redactorNombre ?? "—"} · Revisa {pieza.revisorNombre ?? "—"}</p>}
      </button>
    );
  }

  return (
    <section className="space-y-5">
      <div className="surface flex flex-wrap items-end gap-3 p-4 sm:p-5">
        {vista === "semana" && <div className="space-y-1"><span className="block text-sm font-medium text-muted-foreground">Semana</span><div className="flex min-h-10 items-center rounded-lg border border-input bg-card p-0.5"><button type="button" aria-label="Semana anterior" onClick={() => setSemana((valor) => moverSemana(valor, -1))} className="grid h-9 w-9 place-items-center rounded-md text-xl text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">‹</button><span className="min-w-28 text-center text-sm font-medium text-foreground">{mesDia(semanaDe(semana).inicio)}–{mesDia(semanaDe(semana).fin)}</span><button type="button" aria-label="Semana siguiente" onClick={() => setSemana((valor) => moverSemana(valor, 1))} className="grid h-9 w-9 place-items-center rounded-md text-xl text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">›</button></div></div>}
        {vista === "semana" && <Boton variante="ghost" onClick={() => setSemana(semanaInicial)}>Hoy</Boton>}
        <Selector label="Canal" value={canal} onChange={(e) => setCanal(e.target.value)}>
          <option value="">Todos</option>
          {CANALES_CONTENIDO.map((valor) => <option key={valor} value={valor}>{etiquetaCanal(valor)}</option>)}
        </Selector>
        <Selector label="Trabajador" value={trabajadorId} onChange={(e) => setTrabajadorId(e.target.value)}>
          <option value="">Todos</option>
          {usuarios.map((usuario) => <option key={usuario.id} value={usuario.id}>{usuario.nombre}</option>)}
        </Selector>
        <Boton onClick={() => setCreando(true)}>Nueva pieza</Boton>
        <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto" aria-label="Resumen del contenido">{resumenSemana.map((item) => <span key={item.etiqueta} className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold ${item.tono === "success" ? "border-success/25 bg-success/10 text-success" : item.tono === "info" ? "border-info/25 bg-info/10 text-info" : "border-warning/25 bg-warning/10 text-warning"}`}><span className="tnum">{item.total}</span>{item.etiqueta}</span>)}</div>
      </div>

      {error && <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {aviso && <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{aviso}</p>}

      {filtradas.length === 0 && vista !== "semana" ? (
        <EmptyState titulo="Sin piezas para mostrar" descripcion="Crea una pieza o cambia el filtro para ver el contenido." />
      ) : vista === "semana" ? (
        <div className="grid gap-3">
          {DIAS.map((dia, indice) => {
            const { inicio } = semanaDe(semana);
            const clave = new Date(`${inicio}T00:00:00.000Z`);
            clave.setUTCDate(clave.getUTCDate() + indice);
            const fecha = clave.toISOString().slice(0, 10);
            const delDia = filtradas.filter((pieza) => claveDia(pieza.fechaPublicacion) === fecha);
            const hoy = fecha === semanaInicial;
            return (
              <div key={dia} className={`grid gap-2 rounded-xl p-2 md:grid-cols-[150px_minmax(0,1fr)] md:gap-4 ${hoy ? "bg-primary/5 ring-1 ring-primary/20" : "border border-border/60"}`}>
                <h2 className={`flex min-h-10 items-start gap-2 pt-2 text-sm font-semibold md:flex-col md:items-start md:gap-1 ${hoy ? "text-primary" : "text-foreground"}`}>{dia} {mesDia(fecha)}{hoy && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Hoy</span>}</h2>
                <div className="grid content-start gap-2 sm:grid-cols-2 xl:grid-cols-3">{delDia.length === 0 ? <div className="flex min-h-16 items-center justify-between gap-2 rounded-lg border border-dashed sm:col-span-full border-border px-3 py-2"><span className="text-xs text-muted-foreground">Sin publicaciones</span><button type="button" aria-label={`Crear pieza para ${dia} ${mesDia(fecha)}`} onClick={() => { setForm({ ...form, fechaPublicacion: `${fecha}T09:00` }); setCreando(true); }} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-lg font-medium text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">+</button></div> : delDia.map(tarjeta)}</div>
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

      <Modal abierto={seleccionada !== null} onClose={() => setSeleccionada(null)} titulo={seleccionada?.titulo ?? "Pieza"} ancho="lg">
        {seleccionada && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tono={tonoEstado(seleccionada.estado)} punto>{etiquetaEstadoContenido(seleccionada.estado)}</Badge>
              <span className="text-xs text-muted-foreground">{etiquetaCanal(seleccionada.canal)} · {etiquetaFormato(seleccionada.formato)}</span>
            </div>
            {puedeEditar ? (
              <form onSubmit={(evento) => { evento.preventDefault(); const datos = new FormData(evento.currentTarget); void guardar(seleccionada, { titulo: datos.get("titulo"), copy: datos.get("copy"), canal: datos.get("canal"), formato: datos.get("formato"), fechaPublicacion: fechaConZonaMexico(String(datos.get("fechaPublicacion") ?? "")), enlaceMaterial: datos.get("enlaceMaterial"), notasDiseno: datos.get("notasDiseno") }); }} className="space-y-3">
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
                    <p className="mt-1 text-xs opacity-80">{fechaHora(comentario.creadoAt)}</p>
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
