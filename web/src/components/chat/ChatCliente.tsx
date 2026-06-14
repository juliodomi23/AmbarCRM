"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { aplicarVariables } from "@/lib/plantillas";
import { PanelConversacion } from "@/components/chat/PanelConversacion";

type Embudo = { id: string; nombre: string; etapas: { id: string; nombre: string }[] };
type Usuario = { id: string; nombre: string };
type EtiquetaDef = { id: string; nombre: string; color: string };

export type ConversacionItem = {
  id: string;
  contacto: { nombre: string; telefono: string | null };
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
    case "fallido": return { txt: "⚠️", clase: "text-red-500" };
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
  etiquetas = []
}: {
  conversaciones: ConversacionItem[];
  plantillas: Plantilla[];
  usuarios?: Usuario[];
  embudos?: Embudo[];
  etiquetas?: EtiquetaDef[];
}) {
  const [convs, setConvs] = useState<ConversacionItem[]>(conversaciones);
  const [selId, setSelId] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [panelMovil, setPanelMovil] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroEtiqueta, setFiltroEtiqueta] = useState("");
  const [notaInterna, setNotaInterna] = useState(false);
  const [sugiriendo, setSugiriendo] = useState(false);
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
      return true;
    })
    // Más reciente arriba (como WhatsApp); al responder o llegar mensaje, sube al tope.
    .sort((a, b) => new Date(b.ultimoMensajeAt ?? 0).getTime() - new Date(a.ultimoMensajeAt ?? 0).getTime());

  const cargarMensajes = useCallback(async (id: string) => {
    const res = await fetch(`/api/conversaciones/${id}/mensajes`);
    if (!res.ok) return;
    const data = await res.json();
    setMensajes(data.mensajes);
  }, []);

  function abrir(id: string) {
    setSelId(id);
    setConvs((prev) => prev.map((c) => (c.id === id ? { ...c, noLeidos: 0 } : c)));
    cargarMensajes(id);
  }

  // Pide permiso de notificaciones una vez.
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // SSE: mensajes en vivo
  useEffect(() => {
    const es = new EventSource("/api/stream");
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
      setConvs((prev) =>
        prev.map((c) =>
          c.id === convId
            ? {
                ...c,
                noLeidos: esEntrante && convId !== selRef.current ? c.noLeidos + 1 : c.noLeidos,
                ultimoMensajeAt: new Date().toISOString()
              }
            : c
        )
      );
    };
    return () => es.close();
  }, [cargarMensajes]);

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
      const preview = notaInterna ? `📝 ${texto}` : texto;
      setConvs((prev) => prev.map((c) => (c.id === selId ? { ...c, ultimoMensajeAt: new Date().toISOString(), preview } : c)));
      setTexto("");
      setNotaInterna(false);
    }
  }

  async function grabarVoz() {
    // Si ya está grabando, detiene (el onstop envía la nota).
    if (grabando) {
      recorderRef.current?.stop();
      return;
    }
    if (!selId || !navigator.mediaDevices?.getUserMedia) {
      alert("Tu navegador no permite grabar audio.");
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
        else if (data?.error) alert(`No se pudo enviar el audio: ${data.error}`);
      };
      recorderRef.current = rec;
      rec.start();
      setGrabando(true);
    } catch {
      alert("No se pudo acceder al micrófono.");
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
    else alert(d.error ?? "No se pudo sugerir");
  }

  async function enviarArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-elegir el mismo archivo
    if (!file || !selId) return;
    if (file.size > MAX_MEDIA_MB * 1024 * 1024) {
      alert(`El archivo supera ${MAX_MEDIA_MB} MB (límite de WhatsApp).`);
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
      alert(`No se pudo enviar: ${data.error}`);
    }
  }

  return (
    <>
    <div className="flex h-full">
      {/* Lista de conversaciones */}
      <div className={`w-full border-r border-slate-200 bg-white md:w-80 ${selId ? "hidden md:block" : ""}`}>
        <div className="border-b border-slate-200 px-4 py-3">
          <p className="mb-2 font-semibold text-navy">Conversaciones</p>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar conversación…"
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-navy/30"
          />
          <div className="mt-2 flex gap-2">
            <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}
              className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs">
              <option value="">Todos</option>
              <option value="abierta">Abiertas</option>
              <option value="pendiente">Pendientes</option>
              <option value="cerrada">Cerradas</option>
            </select>
            {etiquetas.length > 0 && (
              <select value={filtroEtiqueta} onChange={(e) => setFiltroEtiqueta(e.target.value)}
                className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs">
                <option value="">Toda etiqueta</option>
                {etiquetas.map((et) => <option key={et.id} value={et.nombre}>{et.nombre}</option>)}
              </select>
            )}
          </div>
        </div>
        <div className="scroll-thin h-[calc(100%-128px)] overflow-y-auto">
          {convsFiltradas.length === 0 && <p className="p-4 text-sm text-slate-400">Sin conversaciones.</p>}
          {convsFiltradas.map((c) => (
            <button
              key={c.id}
              onClick={() => abrir(c.id)}
              className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${
                selId === c.id ? "bg-slate-100" : ""
              }`}
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
              {c.noLeidos > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-green-500 px-1 text-[10px] font-bold text-white">
                  {c.noLeidos}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Hilo */}
      <div className={`flex flex-1 flex-col bg-slate-50 ${selId ? "" : "hidden md:flex"}`}>
        {!seleccionada ? (
          <div className="grid h-full place-items-center text-slate-400">Selecciona una conversación</div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
              <button className="md:hidden text-slate-500" onClick={() => setSelId(null)}>←</button>
              <span className="font-medium text-slate-800">{seleccionada.contacto.nombre}</span>
              <span className="text-xs text-slate-400">{seleccionada.contacto.telefono}</span>
              <button
                onClick={() => setPanelMovil(true)}
                title="Detalles y oportunidades"
                className="ml-auto rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 lg:hidden"
              >
                ℹ️
              </button>
            </div>

            <div className="scroll-thin flex-1 space-y-2 overflow-y-auto p-4">
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
                    {m.interna && <p className="mb-0.5 text-[10px] font-semibold uppercase text-amber-600">📝 Nota interna</p>}
                    {m.tipo === "imagen" && m.mediaUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <a href={m.mediaUrl} target="_blank">
                        <img src={m.mediaUrl} alt="imagen" className="mb-1 max-h-60 rounded-lg" />
                      </a>
                    ) : m.tipo === "audio" && m.mediaUrl ? (
                      <audio controls src={m.mediaUrl} className="mb-1 h-10 w-56 max-w-full" />
                    ) : (
                      m.tipo !== "texto" && m.mediaUrl && (
                        <a href={m.mediaUrl} target="_blank" className="mb-1 block text-xs text-navy underline">
                          📎 {m.tipo}
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
                📎
              </button>
              <button
                type="button"
                title="Sugerir respuesta con IA"
                disabled={sugiriendo || enviando}
                onClick={sugerir}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                {sugiriendo ? "…" : "✨"}
              </button>
              <button
                type="button"
                title={grabando ? "Detener y enviar nota de voz" : "Grabar nota de voz"}
                disabled={enviando || notaInterna}
                onClick={grabarVoz}
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-slate-100 disabled:opacity-50 ${grabando ? "animate-pulse bg-red-100 text-red-600" : "text-slate-500"}`}
              >
                {grabando ? "⏺" : "🎤"}
              </button>
              <button
                type="button"
                title="Nota interna (no se envía a WhatsApp)"
                onClick={() => setNotaInterna((v) => !v)}
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-slate-100 ${notaInterna ? "bg-amber-100 text-amber-600" : "text-slate-500"}`}
              >
                📝
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
                ➤
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
          />
        </div>
      )}
    </div>

    {/* Panel de detalles (móvil): overlay deslizable */}
    {seleccionada && panelMovil && (
      <div className="fixed inset-0 z-40 lg:hidden">
        <div className="absolute inset-0 bg-black/40" onClick={() => setPanelMovil(false)} />
        <div className="absolute right-0 top-0 h-full w-80 max-w-[85%] overflow-y-auto bg-white shadow-xl">
          <div className="flex justify-end p-2">
            <button onClick={() => setPanelMovil(false)} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100">✕</button>
          </div>
          <PanelConversacion
            conversacionId={seleccionada.id}
            usuarios={usuarios}
            embudos={embudos}
            etiquetas={etiquetas}
            onRenombrar={(nombre) =>
              setConvs((prev) => prev.map((c) => (c.id === seleccionada.id ? { ...c, contacto: { ...c.contacto, nombre } } : c)))
            }
          />
        </div>
      </div>
    )}
    </>
  );
}
