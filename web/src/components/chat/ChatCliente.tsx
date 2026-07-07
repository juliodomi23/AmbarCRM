"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { aplicarVariables } from "@/lib/plantillas";
import { PanelConversacion } from "@/components/chat/PanelConversacion";
import { IconoAdjuntar, IconoIA, IconoMicro, IconoNota, IconoInfo, IconoEnviar, IconoCerrar, IconoCheck, IconoFlecha, IconoDeshacer, IconoReloj } from "@/components/icons";
import { toast } from "@/components/Toaster";
import { Boton, Modal } from "@/components/ui";

type Embudo = { id: string; nombre: string; etapas: { id: string; nombre: string }[] };
type Usuario = { id: string; nombre: string };
type EtiquetaDef = { id: string; nombre: string; color: string };

export type ConversacionItem = {
  id: string;
  contacto: { nombre: string; telefono: string | null };
  responsableId: string | null;
  noLeidos: number;
  ultimoMensajeAt: string | null;
  preview: string;
  estado: string;
  etiquetas: string[];
};

type Mensaje = {
  id: string;
  direccion: "entrante" | "saliente";
  tipo: string;
  contenido: string | null;
  mediaUrl: string | null;
  interna: boolean;
  status: string;
  timestamp: string;
};

type Plantilla = { id: string; nombre: string; contenido: string };

function hora(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

/** Acuse de un mensaje saliente: ✓ enviado · ✓✓ entregado · ✓✓ azul leído. */
function ticks(status: string): { txt: string; clase: string } {
  switch (status) {
    case "leido": return { txt: "✓✓", clase: "text-sky-500" };
    case "entregado": return { txt: "✓✓", clase: "text-slate-400" };
    case "enviado": return { txt: "✓", clase: "text-slate-400" };
    case "fallido": return { txt: "!", clase: "font-bold text-red-500" };
    default: return { txt: "", clase: "" };
  }
}

const MAX_MEDIA_MB = 16;

/** Beep corto con Web Audio (sin archivo de audio). */
function reproducirBeep() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
    osc.onended = () => ctx.close();
  } catch {
    /* sin audio disponible */
  }
}

/** Notificación del navegador (si el usuario dio permiso). */
function notificar(titulo: string, cuerpo: string) {
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(titulo, { body: cuerpo });
    }
  } catch {
    /* navegador sin soporte */
  }
}

/** Lee un File como data URL (base64). */
function leerArchivo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function ChatCliente({
  conversaciones,
  plantillas,
  usuarios = [],
  embudos = [],
  etiquetas = [],
  usuarioId
}: {
  conversaciones: ConversacionItem[];
  plantillas: Plantilla[];
  usuarios?: Usuario[];
  embudos?: Embudo[];
  etiquetas?: EtiquetaDef[];
  usuarioId?: string;
}) {
  const [convs, setConvs] = useState<ConversacionItem[]>(conversaciones);
  const [selId, setSelId] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [cargandoMsgs, setCargandoMsgs] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [panelMovil, setPanelMovil] = useState(false);
  const [enVivo, setEnVivo] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroEtiqueta, setFiltroEtiqueta] = useState("");
  const [filtroResponsable, setFiltroResponsable] = useState<"" | "mias" | "sinasignar">("");
  const [buscandoMensajes, setBuscandoMensajes] = useState(false);
  const [notaInterna, setNotaInterna] = useState(false);
  const [sugiriendo, setSugiriendo] = useState(false);
  const [programando, setProgramando] = useState(false);
  const [fechaProgramada, setFechaProgramada] = useState("");
  const [grabando, setGrabando] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const finRef = useRef<HTMLDivElement>(null);
  const archivoRef = useRef<HTMLInputElement>(null);
  const selRef = useRef<string | null>(null);
  selRef.current = selId;
  const convsRef = useRef<ConversacionItem[]>(convs);
  convsRef.current = convs;

  const seleccionada = convs.find((c) => c.id === selId) ?? null;
  const sinAsignarCount = convs.filter((c) => !c.responsableId && c.estado !== "cerrada").length;
  const misCount = usuarioId ? convs.filter((c) => c.responsableId === usuarioId).length : 0;

  const q = busqueda.toLowerCase().trim();
  const convsFiltradas = convs
    .filter((c) => {
      if (q && !(
        c.contacto.nombre.toLowerCase().includes(q) ||
        (c.contacto.telefono ?? "").includes(q) ||
        c.preview.toLowerCase().includes(q)
      )) return false;
      if (filtroEstado && c.estado !== filtroEstado) return false;
      if (filtroEtiqueta && !c.etiquetas.includes(filtroEtiqueta)) return false;
      if (filtroResponsable === "mias" && c.responsableId !== usuarioId) return false;
      if (filtroResponsable === "sinasignar" && c.responsableId !== null) return false;
      return true;
    })
    // Más reciente arriba (como WhatsApp); al responder o llegar mensaje, sube al tope.
    .sort((a, b) => new Date(b.ultimoMensajeAt ?? 0).getTime() - new Date(a.ultimoMensajeAt ?? 0).getTime());

  const cargarMensajes = useCallback(async (id: string) => {
    const res = await fetch(`/api/conversaciones/${id}/mensajes`);
    if (!res.ok) { setCargandoMsgs(false); return; }
    const data = await res.json();
    setMensajes(data.mensajes);
    setCargandoMsgs(false);
  }, []);

  // Refresca la bandeja desde el server (preview = último mensaje, orden y no-leídos exactos).
  const refrescarRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refrescarLista = useCallback(() => {
    if (refrescarRef.current) clearTimeout(refrescarRef.current);
    refrescarRef.current = setTimeout(async () => {
      const res = await fetch("/api/conversaciones");
      if (!res.ok) return;
      const data = await res.json();
      setConvs(data.conversaciones);
    }, 400);
  }, []);

  function abrir(id: string) {
    setSelId(id);
    setMensajes([]);
    setCargandoMsgs(true);
    setConvs((prev) => prev.map((c) => (c.id === id ? { ...c, noLeidos: 0 } : c)));
    cargarMensajes(id);
  }

  async function buscarEnHistorial() {
    if (busqueda.trim().length < 2) return;
    setBuscandoMensajes(true);
    const res = await fetch(`/api/conversaciones?q=${encodeURIComponent(busqueda.trim())}`);
    if (res.ok) {
      const data = await res.json();
      setConvs(data.conversaciones);
    }
    setBuscandoMensajes(false);
  }

  async function cambiarEstadoConv(convId: string, nuevoEstado: string, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/conversaciones/${convId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: nuevoEstado })
    });
    setConvs((prev) => prev.map((c) => c.id === convId ? { ...c, estado: nuevoEstado } : c));
  }

  // Pide permiso de notificaciones una vez.
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Al entrar a la pantalla (incluye navegación con caché de Next) trae la lista fresca del server.
  useEffect(() => {
    refrescarLista();
  }, [refrescarLista]);

  // Abre directo una conversación si viene en la URL (?conv=ID), p. ej. desde el embudo.
  const convParam = useSearchParams().get("conv");
  useEffect(() => {
    if (convParam) abrir(convParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convParam]);

  // SSE: mensajes en vivo
  useEffect(() => {
    const es = new EventSource("/api/stream");
    es.onopen = () => setEnVivo(true);
    es.onerror = () => setEnVivo(false); // EventSource reintenta solo; al reconectar dispara onopen
    es.onmessage = (e) => {
      let payload: { conversacion_id?: number; direccion?: string };
      try { payload = JSON.parse(e.data); } catch { return; }
      const convId = String(payload.conversacion_id);
      const esEntrante = payload.direccion === "entrante";
      if (convId === selRef.current) {
        cargarMensajes(convId);
      }
      // Avisa si entra un mensaje y la conversación no está abierta o la pestaña no está activa.
      if (esEntrante && (document.hidden || convId !== selRef.current)) {
        const conv = convsRef.current.find((c) => c.id === convId);
        reproducirBeep();
        notificar("Nuevo mensaje de WhatsApp", conv ? conv.contacto.nombre : "Tienes un mensaje nuevo");
      }
      // Trae la lista actualizada del server (preview correcto + orden + no-leídos).
      refrescarLista();
    };
    return () => es.close();
  }, [cargarMensajes, refrescarLista]);

  // Autoscroll al final
  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensajes]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!selId || !texto.trim()) return;
    setEnviando(true);
    const res = await fetch("/api/mensajes/enviar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversacionId: selId, texto, interna: notaInterna })
    });
    setEnviando(false);
    const data = await res.json().catch(() => ({}));
    if (data?.mensaje) {
      setMensajes((prev) => (prev.some((m) => m.id === data.mensaje.id) ? prev : [...prev, data.mensaje]));
      const preview = notaInterna ? `Nota: ${texto}` : texto;
      setConvs((prev) => prev.map((c) => (c.id === selId ? { ...c, ultimoMensajeAt: new Date().toISOString(), preview } : c)));
      setTexto("");
      setNotaInterna(false);
    } else {
      toast(data?.error ? `No se pudo enviar: ${data.error}` : "No se pudo enviar el mensaje", "error");
    }
  }

  // Reenvía un mensaje saliente que quedó "fallido" (crea uno nuevo con el mismo texto).
  async function reintentar(contenido: string) {
    if (!selId) return;
    const res = await fetch("/api/mensajes/enviar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversacionId: selId, texto: contenido })
    });
    const data = await res.json().catch(() => ({}));
    if (data?.mensaje) {
      setMensajes((prev) => (prev.some((m) => m.id === data.mensaje.id) ? prev : [...prev, data.mensaje]));
      toast("Mensaje reenviado");
    } else {
      toast(data?.error ? `No se pudo reenviar: ${data.error}` : "No se pudo reenviar", "error");
    }
  }

  async function grabarVoz() {
    // Si ya está grabando, detiene (el onstop envía la nota).
    if (grabando) {
      recorderRef.current?.stop();
      return;
    }
    if (!selId || !navigator.mediaDevices?.getUserMedia) {
      toast("Tu navegador no permite grabar audio.", "error");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
        ? "audio/ogg;codecs=opus"
        : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setGrabando(false);
        const blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size < 1000) return; // muy corto, ignora
        const audioBase64 = await new Promise<string>((res) => {
          const r = new FileReader();
          r.onload = () => res(r.result as string);
          r.readAsDataURL(blob);
        });
        setEnviando(true);
        const resp = await fetch("/api/mensajes/enviar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversacionId: selId, audioBase64, mediaMime: mime.split(";")[0] })
        });
        setEnviando(false);
        const data = await resp.json().catch(() => ({}));
        if (data?.mensaje) setMensajes((prev) => (prev.some((m) => m.id === data.mensaje.id) ? prev : [...prev, data.mensaje]));
        else if (data?.error) toast(`No se pudo enviar el audio: ${data.error}`, "error");
      };
      recorderRef.current = rec;
      rec.start();
      setGrabando(true);
    } catch {
      toast("No se pudo acceder al micrófono.", "error");
    }
  }

  // Abre el modal de programación con "mañana 9:00" como sugerencia.
  function abrirProgramar() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setFechaProgramada(local);
    setProgramando(true);
  }

  async function programar() {
    if (!selId || !texto.trim() || !fechaProgramada) return;
    const res = await fetch("/api/mensajes/programados", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversacionId: selId, texto, enviarAt: new Date(fechaProgramada).toISOString() })
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      setProgramando(false);
      setTexto("");
      toast(`Mensaje programado para ${new Date(fechaProgramada).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`);
    } else {
      toast(d.error ?? "No se pudo programar", "error");
    }
  }

  async function sugerir() {
    if (!selId) return;
    setSugiriendo(true);
    const res = await fetch("/api/ia/sugerir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversacionId: selId })
    });
    setSugiriendo(false);
    const d = await res.json().catch(() => ({}));
    if (d.sugerencia) setTexto(d.sugerencia);
    else toast(d.error ?? "No se pudo sugerir", "error");
  }

  async function enviarArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-elegir el mismo archivo
    if (!file || !selId) return;
    if (file.size > MAX_MEDIA_MB * 1024 * 1024) {
      toast(`El archivo supera ${MAX_MEDIA_MB} MB (límite de WhatsApp).`, "error");
      return;
    }
    setEnviando(true);
    const mediaBase64 = await leerArchivo(file);
    const res = await fetch("/api/mensajes/enviar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversacionId: selId, mediaBase64, mediaMime: file.type, caption: texto })
    });
    setEnviando(false);
    const data = await res.json().catch(() => ({}));
    if (data?.mensaje) {
      setMensajes((prev) => (prev.some((m) => m.id === data.mensaje.id) ? prev : [...prev, data.mensaje]));
      setTexto("");
    } else if (data?.error) {
      toast(`No se pudo enviar: ${data.error}`, "error");
    }
  }

  return (
    <>
    <div className="flex h-full">
      {/* Lista de conversaciones */}
      <div className={`h-full w-full flex-col border-r border-slate-200 bg-white md:w-80 ${selId ? "hidden md:flex" : "flex"}`}>
        <div className="shrink-0 border-b border-slate-200 px-4 py-3 space-y-2">
          <p className="font-semibold text-navy">Conversaciones</p>
          {/* Búsqueda */}
          <div className="flex gap-1">
            <input
              value={busqueda}
              onChange={(e) => { setBusqueda(e.target.value); }}
              onKeyDown={(e) => { if (e.key === "Enter") buscarEnHistorial(); }}
              placeholder="Buscar…"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-navy/30"
            />
            <button
              onClick={buscarEnHistorial}
              disabled={buscandoMensajes || busqueda.trim().length < 2}
              title="Buscar también en el historial de mensajes (Enter)"
              className="shrink-0 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-40"
            >
              {buscandoMensajes ? "…" : "Historial"}
            </button>
            {busqueda && (
              <button
                onClick={() => { setBusqueda(""); refrescarLista(); }}
                aria-label="Limpiar búsqueda"
                className="grid shrink-0 place-items-center rounded-lg border border-slate-200 px-2 text-slate-500 hover:bg-slate-50"
              ><IconoCerrar className="h-4 w-4" /></button>
            )}
          </div>
          {/* Filtros de responsable */}
          <div className="flex gap-1">
            {(["", "mias", "sinasignar"] as const).map((v) => {
              const label = v === "" ? "Todas" : v === "mias" ? `Mis (${misCount})` : `Sin asignar${sinAsignarCount > 0 ? ` (${sinAsignarCount})` : ""}`;
              return (
                <button
                  key={v}
                  onClick={() => setFiltroResponsable(v)}
                  className={`flex-1 rounded-lg py-1 text-[11px] font-medium ${filtroResponsable === v ? "bg-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {/* Filtros estado / etiqueta */}
          <div className="flex gap-2">
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} aria-label="Filtrar por estado"
              className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs">
              <option value="">Todos</option>
              <option value="abierta">Abiertas</option>
              <option value="pendiente">Pendientes</option>
              <option value="cerrada">Cerradas</option>
            </select>
            {etiquetas.length > 0 && (
              <select value={filtroEtiqueta} onChange={(e) => setFiltroEtiqueta(e.target.value)} aria-label="Filtrar por etiqueta"
                className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs">
                <option value="">Toda etiqueta</option>
                {etiquetas.map((et) => <option key={et.id} value={et.nombre}>{et.nombre}</option>)}
              </select>
            )}
          </div>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {convsFiltradas.length === 0 && (
            <p className="p-6 text-center text-sm text-slate-500">
              {busqueda || filtroEstado || filtroEtiqueta || filtroResponsable
                ? "Ninguna conversación coincide con los filtros."
                : "Aún no hay conversaciones. Llegarán aquí cuando entre un mensaje de WhatsApp."}
            </p>
          )}
          {convsFiltradas.map((c) => (
            <div
              key={c.id}
              className={`group relative flex items-center gap-3 border-b border-slate-100 px-4 py-3 hover:bg-slate-50 ${
                selId === c.id ? "bg-slate-100" : ""
              }`}
            >
              <button
                onClick={() => abrir(c.id)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-navy/10 text-sm font-bold text-navy">
                  {c.contacto.nombre.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between">
                    <span className="truncate text-sm font-medium text-slate-800">{c.contacto.nombre}</span>
                    <span className="ml-2 shrink-0 text-[10px] text-slate-400">{hora(c.ultimoMensajeAt)}</span>
                  </span>
                  <span className="truncate block text-xs text-slate-500">{c.preview}</span>
                </span>
              </button>
              <div className="flex shrink-0 flex-col items-center gap-1">
                {c.noLeidos > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-green-500 px-1 text-[10px] font-bold text-white">
                    {c.noLeidos}
                  </span>
                )}
                <button
                  onClick={(e) => cambiarEstadoConv(c.id, c.estado === "cerrada" ? "abierta" : "cerrada", e)}
                  title={c.estado === "cerrada" ? "Reabrir conversación" : "Cerrar conversación"}
                  aria-label={c.estado === "cerrada" ? "Reabrir conversación" : "Cerrar conversación"}
                  className="hidden h-5 w-5 place-items-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-600 group-hover:grid"
                >
                  {c.estado === "cerrada" ? <IconoDeshacer className="h-3.5 w-3.5" /> : <IconoCheck className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Hilo */}
      <div className={`flex flex-1 flex-col bg-slate-50 ${selId ? "" : "hidden md:flex"}`}>
        {!seleccionada ? (
          <div className="grid h-full place-items-center px-6 text-center text-sm text-slate-500">
            Selecciona una conversación para ver el chat.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
              <button
                className="-ml-2 grid h-10 w-10 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 md:hidden"
                aria-label="Volver a la lista"
                onClick={() => setSelId(null)}
              >
                <IconoFlecha className="h-5 w-5" />
              </button>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy/10 text-xs font-bold text-navy">
                {seleccionada.contacto.nombre.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-sm font-semibold text-slate-800">{seleccionada.contacto.nombre}</p>
                {seleccionada.contacto.telefono && (
                  <p className="truncate text-xs text-slate-400">+{seleccionada.contacto.telefono}</p>
                )}
              </div>
              <span
                className="flex shrink-0 items-center gap-1.5 text-[11px] text-slate-500"
                title={enVivo ? "Recibiendo mensajes en tiempo real" : "Sin conexión en vivo, reintentando…"}
              >
                <span className={`h-2 w-2 rounded-full ${enVivo ? "bg-green-500" : "animate-pulse bg-amber-500"}`} />
                <span className="hidden sm:inline">{enVivo ? "En vivo" : "Reconectando…"}</span>
              </span>
              <button
                onClick={() => setPanelMovil(true)}
                title="Detalles y oportunidades"
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden"
              >
                <IconoInfo className="h-5 w-5" />
              </button>
            </div>

            <div className="scroll-thin flex-1 space-y-2 overflow-y-auto p-4">
              {cargandoMsgs && mensajes.length === 0 &&
                [0, 1, 2, 3].map((i) => (
                  <div key={i} className={`flex ${i % 2 ? "justify-end" : "justify-start"}`}>
                    <div className="h-10 w-40 animate-pulse rounded-2xl bg-slate-200" />
                  </div>
                ))}
              {mensajes.map((m) => (
                <div key={m.id} className={`flex ${m.direccion === "saliente" || m.interna ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                      m.interna
                        ? "border border-amber-200 bg-amber-50 text-slate-700"
                        : m.direccion === "saliente"
                        ? "bg-green-100 text-slate-800"
                        : "bg-white text-slate-800"
                    }`}
                  >
                    {m.interna && (
                      <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase text-amber-600">
                        <IconoNota className="h-3 w-3" /> Nota interna
                      </p>
                    )}
                    {m.tipo === "imagen" && m.mediaUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a href={m.mediaUrl} target="_blank">
                        <img src={m.mediaUrl} alt="imagen" className="mb-1 max-h-60 rounded-lg" />
                      </a>
                    ) : m.tipo === "audio" && m.mediaUrl ? (
                      <audio controls src={m.mediaUrl} className="mb-1 h-10 w-56 max-w-full" />
                    ) : (
                      m.tipo !== "texto" && m.mediaUrl && (
                        <a href={m.mediaUrl} target="_blank" className="mb-1 flex items-center gap-1 text-xs text-navy underline">
                          <IconoAdjuntar className="h-3.5 w-3.5" /> {m.tipo}
                        </a>
                      )
                    )}
                    {m.contenido && <p className="whitespace-pre-wrap">{m.contenido}</p>}
                    <p className="mt-0.5 text-right text-[10px] text-slate-400">
                      {hora(m.timestamp)}
                      {m.direccion === "saliente" && !m.interna && ticks(m.status).txt && (
                        <span className={`ml-1 ${ticks(m.status).clase}`}>{ticks(m.status).txt}</span>
                      )}
                    </p>
                    {m.direccion === "saliente" && !m.interna && m.status === "fallido" && m.tipo === "texto" && m.contenido && (
                      <button
                        onClick={() => reintentar(m.contenido!)}
                        className="mt-0.5 flex items-center gap-1 text-right text-[10px] font-medium text-red-600 hover:underline"
                      >
                        <IconoDeshacer className="h-3 w-3" /> Reintentar
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <div ref={finRef} />
            </div>

            {/* Atajo: al escribir "/" aparece la lista de plantillas filtrada */}
            {texto.startsWith("/") && (() => {
              const q = texto.slice(1).toLowerCase();
              const matches = plantillas.filter((p) => p.nombre.toLowerCase().includes(q));
              if (matches.length === 0) return null;
              return (
                <div className="max-h-48 overflow-y-auto border-t border-slate-200 bg-white">
                  {matches.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setTexto(aplicarVariables(p.contenido, seleccionada.contacto))}
                      className="block w-full border-b border-slate-100 px-3 py-2 text-left hover:bg-slate-50"
                    >
                      <span className="text-sm font-medium text-slate-700">/{p.nombre}</span>
                      <span className="block truncate text-xs text-slate-400">{p.contenido}</span>
                    </button>
                  ))}
                </div>
              );
            })()}

            {plantillas.length > 0 && !texto.startsWith("/") && (
              <div className="scroll-thin flex gap-2 overflow-x-auto border-t border-slate-200 bg-white px-3 py-2">
                {plantillas.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setTexto(aplicarVariables(p.contenido, seleccionada.contacto))}
                    className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 hover:bg-slate-200"
                  >
                    {p.nombre}
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={enviar} className="flex items-center gap-2 border-t border-slate-200 bg-white p-3">
              <input
                ref={archivoRef}
                type="file"
                accept="image/*,video/*,audio/*,application/pdf"
                className="hidden"
                onChange={enviarArchivo}
              />
              <button
                type="button"
                title="Adjuntar archivo"
                disabled={enviando || notaInterna}
                onClick={() => archivoRef.current?.click()}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                <IconoAdjuntar />
              </button>
              <button
                type="button"
                title="Sugerir respuesta con IA"
                disabled={sugiriendo || enviando}
                onClick={sugerir}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                {sugiriendo ? <span className="text-xs">…</span> : <IconoIA />}
              </button>
              <button
                type="button"
                title={grabando ? "Detener y enviar nota de voz" : "Grabar nota de voz"}
                disabled={enviando || notaInterna}
                onClick={grabarVoz}
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-slate-100 disabled:opacity-50 ${grabando ? "animate-pulse bg-red-100 text-red-600" : "text-slate-500"}`}
              >
                {grabando ? <span className="h-3 w-3 rounded-full bg-red-600" /> : <IconoMicro />}
              </button>
              <button
                type="button"
                title="Nota interna (no se envía a WhatsApp)"
                onClick={() => setNotaInterna((v) => !v)}
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-slate-100 ${notaInterna ? "bg-amber-100 text-amber-600" : "text-slate-500"}`}
              >
                <IconoNota />
              </button>
              <button
                type="button"
                title="Programar envío (escribe el mensaje primero)"
                disabled={enviando || notaInterna || !texto.trim()}
                onClick={abrirProgramar}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                <IconoReloj />
              </button>
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={notaInterna ? "Nota interna (solo para el equipo)…" : "Escribe un mensaje…"}
                className={`flex-1 rounded-full border px-4 py-2 text-sm outline-none focus:ring-2 ${notaInterna ? "border-amber-300 bg-amber-50 focus:ring-amber-300/40" : "border-slate-300 focus:ring-navy/30"}`}
              />
              <button
                type="submit"
                disabled={enviando || !texto.trim()}
                className="grid h-10 w-10 place-items-center rounded-full bg-navy text-white disabled:opacity-50"
              >
                <IconoEnviar className="h-5 w-5" />
              </button>
            </form>
          </>
        )}
      </div>

      {/* Panel de detalles (desktop): contacto, responsable, estado y oportunidades */}
      {seleccionada && (
        <div className="hidden w-72 shrink-0 overflow-y-auto border-l border-slate-200 bg-white lg:block">
          <PanelConversacion
            conversacionId={seleccionada.id}
            usuarios={usuarios}
            embudos={embudos}
            etiquetas={etiquetas}
            onRenombrar={(nombre) =>
              setConvs((prev) => prev.map((c) => (c.id === seleccionada.id ? { ...c, contacto: { ...c.contacto, nombre } } : c)))
            }
            onPersonal={() => {
              setConvs((prev) => prev.filter((c) => c.id !== seleccionada.id));
              setSelId(null);
            }}
          />
        </div>
      )}
    </div>

    {/* Programar envío */}
    <Modal abierto={programando} onClose={() => setProgramando(false)} titulo="Programar mensaje">
      <div className="space-y-3">
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 whitespace-pre-wrap">{texto}</p>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-600">Enviar el</span>
          <input
            type="datetime-local"
            value={fechaProgramada}
            onChange={(e) => setFechaProgramada(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-navy/30"
          />
        </label>
        <p className="text-xs text-slate-400">Se envía automáticamente. Puedes cancelarlo desde el panel de detalles del chat.</p>
        <div className="flex justify-end gap-2 pt-1">
          <Boton variante="ghost" onClick={() => setProgramando(false)}>Cancelar</Boton>
          <Boton onClick={programar} disabled={!fechaProgramada}>Programar</Boton>
        </div>
      </div>
    </Modal>

    {/* Panel de detalles (móvil): overlay deslizable */}
    {seleccionada && panelMovil && (
      <div className="fixed inset-0 z-40 lg:hidden">
        <div className="absolute inset-0 bg-black/40" onClick={() => setPanelMovil(false)} />
        <div className="absolute right-0 top-0 h-full w-80 max-w-[85%] overflow-y-auto bg-white shadow-xl">
          <div className="flex justify-end p-2">
            <button onClick={() => setPanelMovil(false)} aria-label="Cerrar panel" className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><IconoCerrar className="h-5 w-5" /></button>
          </div>
          <PanelConversacion
            conversacionId={seleccionada.id}
            usuarios={usuarios}
            embudos={embudos}
            etiquetas={etiquetas}
            onRenombrar={(nombre) =>
              setConvs((prev) => prev.map((c) => (c.id === seleccionada.id ? { ...c, contacto: { ...c.contacto, nombre } } : c)))
            }
            onPersonal={() => {
              setConvs((prev) => prev.filter((c) => c.id !== seleccionada.id));
              setSelId(null);
              setPanelMovil(false);
            }}
          />
        </div>
      </div>
    )}
    </>
  );
}
