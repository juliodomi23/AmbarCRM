"use client";

import { useEffect, useRef, useState } from "react";
import { Boton } from "@/components/ui";

type Etiqueta = { id: string; nombre: string; color: string; total: number };
type Plantilla = { id: string; nombre: string; contenido: string };

const LIMITE_DIARIO = 50;

export function DifusionCliente({ etiquetas, plantillas }: { etiquetas: Etiqueta[]; plantillas: Plantilla[] }) {
  const [etiquetaId, setEtiquetaId] = useState("");
  const [plantillaId, setPlantillaId] = useState("");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [yaEnviados, setYaEnviados] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const etiqueta = etiquetas.find((e) => e.id === etiquetaId);
  const restantes = yaEnviados !== null ? Math.max(0, LIMITE_DIARIO - yaEnviados) : null;

  useEffect(() => {
    fetch("/api/difusion")
      .then((r) => r.json())
      .then((d) => { if (typeof d.yaEnviados === "number") setYaEnviados(d.yaEnviados); })
      .catch(() => {});
  }, []);

  function elegirPlantilla(id: string) {
    setPlantillaId(id);
    const p = plantillas.find((x) => x.id === id);
    if (p) setTexto(p.contenido);
  }

  const destinatariosEfectivos = Math.min(etiqueta?.total ?? 0, restantes ?? LIMITE_DIARIO);

  async function enviar() {
    if (!etiquetaId || !texto.trim()) return;
    if (restantes !== null && restantes === 0) {
      setResultado({ ok: false, texto: `Límite diario de ${LIMITE_DIARIO} mensajes alcanzado. Vuelve mañana.` });
      return;
    }
    if (!confirm(
      `Se enviará a ${destinatariosEfectivos} contacto(s) con la etiqueta "${etiqueta?.nombre}".\n\n` +
      `⚠️ Cuantos más mensajes envíes, mayor el riesgo de baneo del número. Usa con responsabilidad.\n\n¿Continuar?`
    )) return;
    setEnviando(true);
    setResultado(null);
    const res = await fetch("/api/difusion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ etiquetaId, texto })
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setEnviando(false);
      setResultado({ ok: false, texto: d.error ?? "Error al enviar" });
      return;
    }

    // El envío corre en el servidor en segundo plano; aquí solo seguimos el avance.
    const base = d.yaEnviadosHoy ?? yaEnviados ?? 0;
    const objetivo = base + (d.encolados ?? 0);
    setResultado({ ok: true, texto: `Enviando ${d.encolados} mensaje(s) en segundo plano (con pausa entre cada uno). Puedes salir de esta pantalla.` });
    pollRef.current = setInterval(async () => {
      const r = await fetch("/api/difusion").then((x) => x.json()).catch(() => null);
      if (r == null || typeof r.yaEnviados !== "number") return;
      setYaEnviados(r.yaEnviados);
      if (r.yaEnviados >= objetivo || r.restantes === 0) {
        if (pollRef.current) clearInterval(pollRef.current);
        setEnviando(false);
        setResultado({ ok: true, texto: `✓ Difusión terminada · Usados hoy: ${r.yaEnviados}/${LIMITE_DIARIO}` });
      }
    }, 5000);
  }

  return (
    <div className="max-w-lg space-y-4 p-4 md:p-6">
      <h1 className="text-xl font-bold text-navy">Difusión por etiqueta</h1>

      {/* Alerta de riesgo */}
      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-slate-700">
        <p className="mb-1 font-semibold text-red-700">Riesgo de baneo — lee antes de enviar</p>
        <ul className="list-disc space-y-1 pl-4 text-slate-600">
          <li>WhatsApp detecta patrones de envío masivo y puede <b>bloquear permanentemente</b> el número.</li>
          <li>El límite es <b>{LIMITE_DIARIO} mensajes por día</b>. Cuantos más envíes, mayor el riesgo.</li>
          <li>Evita enviar a contactos que no te conocen o que no dieron su número voluntariamente.</li>
          <li>Si el número es nuevo (&lt; 3 meses), empieza con 10–20 mensajes al día e incrementa gradualmente.</li>
        </ul>
      </div>

      {/* Contador diario */}
      {restantes !== null && (
        <div className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
          restantes === 0 ? "border-red-200 bg-red-50 text-red-700" :
          restantes < 15 ? "border-amber-200 bg-amber-50 text-amber-700" :
          "border-slate-200 bg-slate-50 text-slate-600"
        }`}>
          <span>Enviados hoy: <b>{yaEnviados}</b> de {LIMITE_DIARIO}</span>
          <span className={`font-semibold ${restantes === 0 ? "text-red-700" : "text-slate-700"}`}>
            {restantes === 0 ? "Límite alcanzado" : `${restantes} disponibles`}
          </span>
        </div>
      )}

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-600">Etiqueta destino</span>
          <select value={etiquetaId} onChange={(e) => setEtiquetaId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Elige una etiqueta…</option>
            {etiquetas.map((e) => <option key={e.id} value={e.id}>{e.nombre} ({e.total})</option>)}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-600">Plantilla (opcional)</span>
          <select value={plantillaId} onChange={(e) => elegirPlantilla(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Escribir mensaje libre…</option>
            {plantillas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-600">Mensaje</span>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4}
            placeholder="Hola {{nombre}}, te tenemos una promoción…"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-navy/30" />
          <span className="text-xs text-slate-400">Variables: {"{{nombre}}"}, {"{{telefono}}"}.</span>
        </label>

        {etiqueta && restantes !== null && (
          <p className="text-xs text-slate-500">
            La etiqueta tiene {etiqueta.total} contacto(s).
            {etiqueta.total > restantes
              ? ` Solo se enviarán ${restantes} (límite diario restante).`
              : " Se enviará a todos."}
          </p>
        )}

        <Boton
          onClick={enviar}
          disabled={enviando || !etiquetaId || !texto.trim() || restantes === 0}
        >
          {enviando ? `Enviando… (pausa entre cada mensaje)` : `Enviar a ${destinatariosEfectivos} contacto(s)`}
        </Boton>

        {resultado && (
          <p className={`text-sm ${resultado.ok ? "text-slate-700" : "text-red-600"}`}>{resultado.texto}</p>
        )}
      </div>
    </div>
  );
}
