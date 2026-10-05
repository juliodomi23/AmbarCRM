"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconoEnviar } from "@/components/icons";

type PersonalItem = {
  id: string;
  contactoId: string;
  nombre: string;
  telefono: string | null;
  noLeidos: number;
  ultimoMensajeAt: string | null;
  preview: string;
};

type Mensaje = {
  id: string;
  direccion: "entrante" | "saliente";
  tipo: string;
  contenido: string | null;
  mediaUrl: string | null;
  interna: boolean;
  timestamp: string;
};

function hora(iso: string | null) {
  return iso ? new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) : "";
}

export function PersonalCliente({ itemsIniciales }: { itemsIniciales: PersonalItem[] }) {
  const [items, setItems] = useState<PersonalItem[]>(itemsIniciales);
  const [selId, setSelId] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const finRef = useRef<HTMLDivElement>(null);
  const selRef = useRef<string | null>(null);
  selRef.current = selId;

  const seleccionado = items.find((i) => i.id === selId) ?? null;

  const cargarMensajes = useCallback(async (id: string) => {
    const res = await fetch(`/api/conversaciones/${id}/mensajes`);
    if (res.ok) setMensajes((await res.json()).mensajes);
  }, []);

  const refrescarLista = useCallback(async () => {
    const res = await fetch("/api/personal");
    if (res.ok) setItems((await res.json()).personal);
  }, []);

  function abrir(id: string) {
    setSelId(id);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, noLeidos: 0 } : i)));
    cargarMensajes(id);
  }

  useEffect(() => {
    refrescarLista();
    const t = setInterval(refrescarLista, 8000);
    return () => clearInterval(t);
  }, [refrescarLista]);

  useEffect(() => {
    if (!selId) return;
    const t = setInterval(() => cargarMensajes(selId), 5000);
    return () => clearInterval(t);
  }, [selId, cargarMensajes]);

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: "smooth" }); }, [mensajes]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!selId || !texto.trim()) return;
    setEnviando(true);
    const res = await fetch("/api/mensajes/enviar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversacionId: selId, texto })
    });
    setEnviando(false);
    const d = await res.json().catch(() => ({}));
    if (d?.mensaje) {
      setMensajes((prev) => (prev.some((m) => m.id === d.mensaje.id) ? prev : [...prev, d.mensaje]));
      setTexto("");
    }
  }

  async function quitarPersonal() {
    if (!seleccionado) return;
    if (!confirm(`Quitar a ${seleccionado.nombre} de Personal? Sus mensajes volverán a la bandeja principal.`)) return;
    await fetch(`/api/contactos/${seleccionado.contactoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ esPersonal: false })
    });
    setItems((prev) => prev.filter((i) => i.id !== selId));
    setSelId(null);
  }

  return (
    <div className="flex h-full">
      {/* Lista */}
      <div className={`h-full w-full flex-col border-r border-slate-200 bg-white md:w-80 ${selId ? "hidden md:flex" : "flex"}`}>
        <div className="shrink-0 border-b border-slate-200 px-4 py-3">
          <p className="font-semibold text-navy">Personal</p>
          <p className="mt-0.5 text-xs text-slate-400">
            Familia y amigos. El bot no responde aqui y los archivos no se guardan.
          </p>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          {items.length === 0 && (
            <p className="p-4 text-sm text-slate-400">
              Ninguno aun. Marca un contacto como Personal desde el panel de chat.
            </p>
          )}
          {items.map((i) => (
            <button
              key={i.id}
              onClick={() => abrir(i.id)}
              className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${selId === i.id ? "bg-slate-100" : ""}`}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-200 text-sm font-bold text-slate-600">
                {i.nombre.slice(0, 2).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between">
                  <span className="truncate text-sm font-medium text-slate-800">{i.nombre}</span>
                  <span className="ml-2 shrink-0 text-[10px] text-slate-400">{hora(i.ultimoMensajeAt)}</span>
                </span>
                <span className="block truncate text-xs text-slate-500">{i.preview}</span>
              </span>
              {i.noLeidos > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-slate-400 px-1 text-[10px] font-bold text-white">
                  {i.noLeidos}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Hilo */}
      <div className={`flex flex-1 flex-col bg-slate-50 ${selId ? "" : "hidden md:flex"}`}>
        {!seleccionado ? (
          <div className="grid h-full place-items-center text-slate-400">Selecciona una conversacion</div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
              <button className="text-slate-500 md:hidden" onClick={() => setSelId(null)}>←</button>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate font-medium text-slate-800">{seleccionado.nombre}</p>
                {seleccionado.telefono && <p className="truncate text-xs text-slate-400">+{seleccionado.telefono}</p>}
              </div>
              <button
                onClick={quitarPersonal}
                className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50"
              >
                Quitar de Personal
              </button>
            </div>

            <div className="scroll-thin flex-1 space-y-2 overflow-y-auto p-4">
              {mensajes.map((m) => (
                <div key={m.id} className={`flex ${m.direccion === "saliente" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                    m.direccion === "saliente" ? "bg-green-100 text-slate-800" : "bg-white text-slate-800"
                  }`}>
                    {m.contenido && <p className="whitespace-pre-wrap">{m.contenido}</p>}
                    {!m.contenido && m.tipo !== "texto" && (
                      <p className="text-xs text-slate-400 italic">[{m.tipo} — archivo no guardado]</p>
                    )}
                    <p className="mt-0.5 text-right text-[10px] text-slate-400">{hora(m.timestamp)}</p>
                  </div>
                </div>
              ))}
              <div ref={finRef} />
            </div>

            <form onSubmit={enviar} className="flex items-center gap-2 border-t border-slate-200 bg-white p-3">
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Escribe un mensaje…"
                className="flex-1 rounded-full border border-slate-300 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-navy/30"
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
    </div>
  );
}
