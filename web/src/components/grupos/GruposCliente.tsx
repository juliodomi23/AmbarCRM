"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconoAdjuntar, IconoEnviar } from "@/components/icons";
import { toast } from "@/components/Toaster";
import { Lightbox } from "@/components/ui";

type GrupoItem = { id: string; nombre: string; noLeidos: number; ultimoMensajeAt: string | null; preview: string };
type Mensaje = {
  id: string;
  direccion: "entrante" | "saliente";
  tipo: string;
  contenido: string | null;
  mediaUrl: string | null;
  remitente: string | null;
  timestamp: string;
};

const MAX_MB = 16;
function hora(iso: string | null) {
  return iso ? new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "";
}
function leerArchivo(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(f);
  });
}

export function GruposCliente({ gruposIniciales }: { gruposIniciales: GrupoItem[] }) {
  const [grupos, setGrupos] = useState<GrupoItem[]>(gruposIniciales);
  const [selId, setSelId] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [imagenAbierta, setImagenAbierta] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);
  const archivoRef = useRef<HTMLInputElement>(null);
  const selRef = useRef<string | null>(null);
  selRef.current = selId;

  const seleccionado = grupos.find((g) => g.id === selId) ?? null;

  const cargarMensajes = useCallback(async (id: string) => {
    const res = await fetch(`/api/grupos/${id}/mensajes`);
    if (res.ok) setMensajes((await res.json()).mensajes);
  }, []);

  const refrescarLista = useCallback(async () => {
    const res = await fetch("/api/grupos");
    if (res.ok) setGrupos((await res.json()).grupos);
  }, []);

  function abrir(id: string) {
    setSelId(id);
    setGrupos((prev) => prev.map((g) => (g.id === id ? { ...g, noLeidos: 0 } : g)));
    cargarMensajes(id);
  }

  // Polling (los grupos no usan SSE): lista cada 6 s, hilo abierto cada 4 s.
  useEffect(() => {
    refrescarLista(); // fresco al entrar (evita la lista cacheada de Next)
    const t = setInterval(refrescarLista, 6000);
    return () => clearInterval(t);
  }, [refrescarLista]);
  useEffect(() => {
    if (!selId) return;
    const t = setInterval(() => cargarMensajes(selId), 4000);
    return () => clearInterval(t);
  }, [selId, cargarMensajes]);
  useEffect(() => { finRef.current?.scrollIntoView({ behavior: "smooth" }); }, [mensajes]);

  async function importar() {
    setImportando(true);
    const res = await fetch("/api/grupos/importar", { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setImportando(false);
    if (res.ok) {
      await refrescarLista();
      if (d.grupos === 0) toast("WhatsApp aún está sincronizando; espera unos segundos y reintenta.", "error");
      else toast(`Importados ${d.gruposNuevos} grupos nuevos (de ${d.grupos}).`);
    } else toast(d.error ?? "No se pudo importar", "error");
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!selId || !texto.trim()) return;
    setEnviando(true);
    const res = await fetch(`/api/grupos/${selId}/mensajes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto })
    });
    setEnviando(false);
    const d = await res.json().catch(() => ({}));
    if (d?.mensaje) {
      setMensajes((prev) => [...prev, d.mensaje]);
      setTexto("");
    } else if (d?.error) toast(d.error, "error");
  }

  async function enviarArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selId) return;
    if (file.size > MAX_MB * 1024 * 1024) return toast(`El archivo supera ${MAX_MB} MB (límite de WhatsApp).`, "error");
    setEnviando(true);
    const mediaBase64 = await leerArchivo(file);
    const res = await fetch(`/api/grupos/${selId}/mensajes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaBase64, mediaMime: file.type, caption: texto })
    });
    setEnviando(false);
    const d = await res.json().catch(() => ({}));
    if (d?.mensaje) { setMensajes((prev) => [...prev, d.mensaje]); setTexto(""); }
    else if (d?.error) toast(d.error, "error");
  }

  return (
    <div className="flex h-full">
      <div className={`h-full w-full flex-col border-r border-slate-200 bg-white md:w-80 ${selId ? "hidden md:flex" : "flex"}`}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
          <span className="font-semibold text-navy">Grupos</span>
          <button onClick={importar} disabled={importando}
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-navy hover:bg-slate-50 disabled:opacity-50">
            {importando ? "Importando…" : "Importar grupos"}
          </button>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {grupos.length === 0 && <p className="p-4 text-sm text-slate-400">Aún no hay grupos. Llegarán cuando reciban mensajes.</p>}
          {grupos.map((g) => (
            <button key={g.id} onClick={() => abrir(g.id)}
              className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${selId === g.id ? "bg-slate-100" : ""}`}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-navy/10 text-sm font-bold text-navy">
                {g.nombre.slice(0, 2).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between">
                  <span className="truncate text-sm font-medium text-slate-800">{g.nombre}</span>
                  <span className="ml-2 shrink-0 text-[10px] text-slate-400">{hora(g.ultimoMensajeAt)}</span>
                </span>
                <span className="block truncate text-xs text-slate-500">{g.preview}</span>
              </span>
              {g.noLeidos > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-green-500 px-1 text-[10px] font-bold text-white">{g.noLeidos}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className={`flex flex-1 flex-col bg-slate-50 ${selId ? "" : "hidden md:flex"}`}>
        {!seleccionado ? (
          <div className="grid h-full place-items-center text-slate-400">Selecciona un grupo</div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
              <button className="text-slate-500 md:hidden" onClick={() => setSelId(null)}>←</button>
              <span className="font-medium text-slate-800">{seleccionado.nombre}</span>
            </div>

            <div className="scroll-thin flex-1 space-y-2 overflow-y-auto p-4">
              {mensajes.map((m) => (
                <div key={m.id} className={`flex ${m.direccion === "saliente" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm ${m.direccion === "saliente" ? "bg-green-100" : "bg-white"} text-slate-800`}>
                    {m.direccion === "entrante" && m.remitente && (
                      <p className="mb-0.5 text-[11px] font-semibold text-navy">{m.remitente}</p>
                    )}
                    {m.tipo === "imagen" && m.mediaUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <button type="button" onClick={() => setImagenAbierta(m.mediaUrl)} className="block cursor-zoom-in">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={m.mediaUrl} alt="imagen" loading="lazy" className="mb-1 max-h-60 rounded-lg" />
                      </button>
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
                    <p className="mt-0.5 text-right text-[10px] text-slate-400">{hora(m.timestamp)}</p>
                  </div>
                </div>
              ))}
              <div ref={finRef} />
            </div>

            <form onSubmit={enviar} className="flex items-center gap-2 border-t border-slate-200 bg-white p-3">
              <input ref={archivoRef} type="file" accept="image/*,video/*,audio/*,application/pdf" className="hidden" onChange={enviarArchivo} />
              <button type="button" title="Adjuntar" disabled={enviando} onClick={() => archivoRef.current?.click()}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-50">
                <IconoAdjuntar />
              </button>
              <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe al grupo…"
                className="flex-1 rounded-full border border-slate-300 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-navy/30" />
              <button type="submit" disabled={enviando || !texto.trim()}
                className="grid h-10 w-10 place-items-center rounded-full bg-navy text-white disabled:opacity-50">
                <IconoEnviar className="h-5 w-5" />
              </button>
            </form>
          </>
        )}
      </div>
      <Lightbox url={imagenAbierta} onClose={() => setImagenAbierta(null)} />
    </div>
  );
}
