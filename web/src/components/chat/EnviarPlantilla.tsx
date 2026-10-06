"use client";

import { useEffect, useState } from "react";
import { Boton, Campo, Modal } from "@/components/ui";
import { toast } from "@/components/Toaster";
import { variablesDePlantilla } from "@/lib/meta/plantillaMeta";

type Componente = { type?: string; text?: string; buttons?: { text?: string }[] };
type PlantillaMeta = { name: string; language: string; status?: string; components?: Componente[] };

function cuerpo(p: PlantillaMeta) {
  return p.components?.find((c) => c.type === "BODY")?.text ?? "";
}

function botones(p: PlantillaMeta) {
  return p.components?.find((c) => c.type === "BUTTONS")?.buttons?.map((b) => b.text ?? "") ?? [];
}

/** Envía una plantilla aprobada de Meta a una conversación (único envío posible fuera de las 24 h). */
export function EnviarPlantilla({
  abierto,
  onClose,
  canalId,
  conversacionId,
  nombreContacto,
  onEnviado
}: {
  abierto: boolean;
  onClose: () => void;
  canalId: string | null;
  conversacionId: string;
  nombreContacto: string;
  onEnviado: (mensaje: unknown) => void;
}) {
  const [plantillas, setPlantillas] = useState<PlantillaMeta[]>([]);
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [elegida, setElegida] = useState<PlantillaMeta | null>(null);
  const [valores, setValores] = useState<string[]>([]);

  useEffect(() => {
    if (!abierto || !canalId) return;
    setCargando(true);
    fetch(`/api/meta/templates?canalId=${encodeURIComponent(canalId)}`)
      .then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error || "No se pudieron cargar las plantillas");
        setPlantillas((data.plantillas || []).filter((p: PlantillaMeta) => p.status === "APPROVED"));
      })
      .catch((error) => toast(error.message, "error"))
      .finally(() => setCargando(false));
  }, [abierto, canalId]);

  const texto = elegida ? cuerpo(elegida) : "";
  const variables = variablesDePlantilla(texto);
  const vistaPrevia = texto.replace(/\{\{(\d+)\}\}/g, (_, n) => valores[Number(n) - 1] || `{{${n}}}`);

  function elegir(clave: string) {
    const p = plantillas.find((item) => `${item.name}:${item.language}` === clave) ?? null;
    setElegida(p);
    // {{1}} casi siempre es el nombre del cliente: lo prellenamos.
    setValores(p && variablesDePlantilla(cuerpo(p)).length ? [nombreContacto] : []);
  }

  async function enviar() {
    if (!elegida) return;
    if (variables.some((n) => !valores[n - 1]?.trim())) return toast("Llena todas las variables", "error");
    setEnviando(true);
    const res = await fetch("/api/mensajes/enviar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversacionId,
        plantilla: { name: elegida.name, language: elegida.language, variables: valores.slice(0, variables.length), vistaPrevia }
      })
    });
    const data = await res.json().catch(() => ({}));
    setEnviando(false);
    if (data?.mensaje) onEnviado(data.mensaje);
    if (!res.ok) return toast(data?.error ? `No se pudo enviar: ${data.error}` : "No se pudo enviar la plantilla", "error");
    toast("Plantilla enviada", "ok");
    setElegida(null);
    setValores([]);
    onClose();
  }

  return (
    <Modal abierto={abierto} onClose={onClose} titulo="Enviar plantilla de Meta">
      <div className="space-y-3">
        {!canalId && <p className="text-sm text-muted-foreground">Esta conversación no tiene un número conectado.</p>}
        {canalId && cargando && <p className="text-sm text-muted-foreground">Cargando plantillas…</p>}
        {canalId && !cargando && plantillas.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No hay plantillas aprobadas. Créalas en Configuración → Plantillas de Meta.
          </p>
        )}
        {plantillas.length > 0 && (
          <label className="block space-y-1">
            <span className="text-sm font-medium text-muted-foreground">Plantilla aprobada</span>
            <select
              value={elegida ? `${elegida.name}:${elegida.language}` : ""}
              onChange={(e) => elegir(e.target.value)}
              className="w-full rounded-lg border border-input px-3 py-2 text-sm"
            >
              <option value="">Elige una plantilla…</option>
              {plantillas.map((p) => (
                <option key={`${p.name}:${p.language}`} value={`${p.name}:${p.language}`}>
                  {p.name} · {p.language}
                </option>
              ))}
            </select>
          </label>
        )}
        {variables.map((n) => (
          <Campo
            key={n}
            label={`Valor para {{${n}}}`}
            value={valores[n - 1] || ""}
            onChange={(e) => {
              const siguientes = [...valores];
              siguientes[n - 1] = e.target.value;
              setValores(siguientes);
            }}
          />
        ))}
        {elegida && (
          <div className="rounded-lg bg-background p-3 text-sm">
            <p className="whitespace-pre-wrap text-foreground">{vistaPrevia}</p>
            {botones(elegida).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {botones(elegida).map((b) => (
                  <span key={b} className="rounded-full border border-border px-3 py-1 text-xs text-primary">{b}</span>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Boton variante="ghost" onClick={onClose}>Cancelar</Boton>
          <Boton onClick={enviar} disabled={!elegida || enviando}>{enviando ? "Enviando…" : "Enviar plantilla"}</Boton>
        </div>
      </div>
    </Modal>
  );
}
