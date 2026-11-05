"use client";

import { useEffect, useState } from "react";
import { Boton } from "@/components/ui";
import { toast } from "@/components/Toaster";
import { nombreVisibleCanal } from "@/lib/channel/tipo-canal";
import {
  configTaller,
  PLANTILLAS_SUGERIDAS,
  TIPOS_NOTIFICACION_TALLER,
  VARIABLES_PLANTILLA_TALLER,
  type TipoNotificacionTaller,
} from "@/lib/taller-mensajes";

type Plantilla = { name: string; language: string; status?: string };

const ETIQUETAS: Record<TipoNotificacionTaller, string> = {
  aprobacion: "Cotización lista para aprobar",
  listo: "Vehículo listo para entrega",
  estado: "Seguimiento del estado",
};

const CLAVES: Record<TipoNotificacionTaller, string> = {
  aprobacion: "plantillaAprobacion",
  listo: "plantillaListo",
  estado: "plantillaEstado",
};

const clavePlantilla = (plantilla?: { name: string; language: string } | null) =>
  plantilla ? `${plantilla.name}|${plantilla.language}` : "";

export function TallerConfig({ modulo, canales }: { modulo: any; canales: any[] }) {
  const inicial = configTaller(modulo.config);
  const [simularEnvio, setSimularEnvio] = useState(inicial.simularEnvio);
  const [avisarAlMarcarListo, setAvisarAlMarcarListo] = useState(inicial.avisarAlMarcarListo);
  const [canalId, setCanalId] = useState(String(inicial.canalId ?? canales[0]?.id ?? ""));
  const [leyenda, setLeyenda] = useState(inicial.leyendaRecepcion);
  const [anticipoPorcentaje, setAnticipoPorcentaje] = useState(String(inicial.anticipoPorcentaje));
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [elegidas, setElegidas] = useState<Record<TipoNotificacionTaller, string>>({
    aprobacion: clavePlantilla(inicial.plantillas.aprobacion),
    listo: clavePlantilla(inicial.plantillas.listo),
    estado: clavePlantilla(inicial.plantillas.estado),
  });
  const [errorPlantillas, setErrorPlantillas] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vigente = true;
    setErrorPlantillas("");
    setPlantillas([]);
    if (!canalId) return;
    void fetch(`/api/meta/templates?canalId=${encodeURIComponent(canalId)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("No se pudieron cargar las plantillas aprobadas");
        return res.json();
      })
      .then((data) => {
        if (!vigente) return;
        setPlantillas((data.plantillas ?? []).filter((item: Plantilla) => item.status === "APPROVED"));
      })
      .catch(() => {
        if (vigente) setErrorPlantillas("No se pudieron cargar las plantillas aprobadas. Revisa el canal e intenta de nuevo.");
      });
    return () => {
      vigente = false;
    };
  }, [canalId]);

  async function guardar() {
    const config: Record<string, unknown> = {
      simularEnvio,
      avisarAlMarcarListo,
      leyendaRecepcion: leyenda.trim(),
      anticipoPorcentaje: Number(anticipoPorcentaje) || 0,
      canalId: canalId || null,
    };
    for (const tipo of TIPOS_NOTIFICACION_TALLER) {
      const plantilla = plantillas.find((item) => clavePlantilla(item) === elegidas[tipo]);
      config[CLAVES[tipo]] = plantilla ? { name: plantilla.name, language: plantilla.language } : null;
    }
    setGuardando(true);
    try {
      const res = await fetch("/api/modulos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave: "taller", config }),
      });
      const datos = await res.json().catch(() => ({}));
      toast(res.ok ? "Configuración de WhatsApp del taller guardada" : datos.error ?? "No se pudo guardar", res.ok ? "ok" : "error");
    } catch {
      toast("No se pudo guardar. Revisa tu conexión.", "error");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mt-4 space-y-4 border-t border-border pt-4 text-sm">
      <div className="space-y-2">
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={simularEnvio} onChange={(e) => setSimularEnvio(e.target.checked)} className="mt-1" />
          <span>
            <span className="font-medium">Modo simulado</span>
            <span className="block text-muted-foreground">
              No envía mensajes reales, pero registra el aviso y muestra el texto al equipo. Actívalo mientras pruebas.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={avisarAlMarcarListo} onChange={(e) => setAvisarAlMarcarListo(e.target.checked)} className="mt-1" />
          <span>
            <span className="font-medium">Avisar al marcar la orden como lista</span>
            <span className="block text-muted-foreground">
              Se envía el aviso justo al pasar la orden a «listo». Los demás avisos se mandan a mano.
            </span>
          </span>
        </label>
      </div>

      <label className="block space-y-1">
        <span className="font-medium">Canal de WhatsApp</span>
        <select value={canalId} onChange={(e) => setCanalId(e.target.value)} className="w-full rounded-lg border p-2">
          {!canales.length && <option value="">Sin canales configurados</option>}
          {canales.map((canal) => (
            <option key={canal.id} value={canal.id}>
              {nombreVisibleCanal(canal.nombre, canal.proveedor)}
            </option>
          ))}
        </select>
      </label>

      {errorPlantillas && <p role="alert" className="text-destructive">{errorPlantillas}</p>}

      {TIPOS_NOTIFICACION_TALLER.map((tipo) => (
        <div key={tipo} className="space-y-2 rounded-lg border border-border p-3">
          <label className="block space-y-1">
            <span className="font-medium">{ETIQUETAS[tipo]}</span>
            <select
              value={elegidas[tipo]}
              onChange={(e) => setElegidas({ ...elegidas, [tipo]: e.target.value })}
              className="w-full rounded-lg border p-2"
            >
              <option value="">Sin plantilla (solo respaldo manual)</option>
              {plantillas.map((item) => (
                <option key={`${tipo}-${clavePlantilla(item)}`} value={clavePlantilla(item)}>
                  {item.name} · {item.language}
                </option>
              ))}
            </select>
          </label>
          <p className="text-muted-foreground">
            Variables, en orden: {VARIABLES_PLANTILLA_TALLER[tipo].join(" · ")}
          </p>
          <p className="rounded-lg bg-muted p-2 font-mono text-xs whitespace-pre-wrap">{PLANTILLAS_SUGERIDAS[tipo]}</p>
        </div>
      ))}

      <label className="block space-y-1">
        <span className="font-medium">Anticipo sugerido</span>
        <input type="number" min={0} max={100} step={5} value={anticipoPorcentaje} onChange={(e) => setAnticipoPorcentaje(e.target.value)} className="w-full rounded-lg border p-2" />
        <span className="text-xs text-muted-foreground">Porcentaje del total que se sugiere cobrar como anticipo (0 = no sugerir). Nunca bloquea el avance de la orden.</span>
      </label>

      <label className="block space-y-1">
        <span className="font-medium">Leyenda de la orden de recepción</span>
        <textarea value={leyenda} onChange={(e) => setLeyenda(e.target.value)} rows={4} maxLength={2000} className="w-full rounded-lg border p-2" />
      </label>

      <Boton onClick={() => void guardar()} disabled={guardando}>
        {guardando ? "Guardando…" : "Guardar WhatsApp del taller"}
      </Boton>
    </div>
  );
}
