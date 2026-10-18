"use client";

import { useEffect, useMemo, useState } from "react";
import { Boton } from "@/components/ui";
import { toast } from "@/components/Toaster";
import type { VariableRecordatorio } from "@/lib/citas";
import { duracionCitas } from "@/lib/citas-duracion";

type Plantilla = {
  name: string;
  language: string;
  status?: string;
  components?: unknown[];
};

const OPCIONES: { value: VariableRecordatorio; label: string }[] = [
  { value: "nombre_contacto", label: "Nombre del contacto" },
  { value: "fecha_hora", label: "Fecha y hora de la cita" },
  { value: "titulo_cita", label: "Título de la cita" },
  { value: "nombre_negocio", label: "Nombre del negocio" },
];

function totalVariables(plantilla?: Plantilla) {
  const texto = JSON.stringify(plantilla?.components ?? []);
  return Math.max(
    0,
    ...Array.from(texto.matchAll(/\{\{(\d+)\}\}/g), (m) => Number(m[1])),
  );
}

export function CitasConfig({
  modulo,
  canales,
}: {
  modulo: any;
  canales: any[];
}) {
  const inicial = modulo.config ?? {};
  const [duracionMin, setDuracionMin] = useState(duracionCitas(inicial));
  const [guardandoDuracion, setGuardandoDuracion] = useState(false);

  async function guardarDuracion() {
    if (!Number.isInteger(duracionMin) || duracionMin < 5 || duracionMin > 480) return toast("La duración debe ser de 5 a 480 minutos", "error");
    setGuardandoDuracion(true);
    try {
      const res = await fetch("/api/modulos", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clave: "citas", config: { duracionMin } }) });
      const datos = await res.json();
      toast(res.ok ? "Duración por defecto guardada" : datos.error ?? "No se pudo guardar la duración", res.ok ? "ok" : "error");
    } catch { toast("No se pudo guardar la duración. Revisa tu conexión.", "error"); }
    finally { setGuardandoDuracion(false); }
  }
  const [canalId, setCanalId] = useState(
    String(inicial.canalId ?? canales[0]?.id ?? ""),
  );
  const [errorPlantillas, setErrorPlantillas] = useState("");
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [plantillaNombre, setPlantillaNombre] = useState(
    String(inicial.plantilla?.name ?? ""),
  );
  const [anticipacionHoras, setAnticipacionHoras] = useState(
    Number(inicial.anticipacionHoras ?? 24),
  );
  const [mapeo, setMapeo] = useState<VariableRecordatorio[]>(
    inicial.mapeoVariables ?? [],
  );
  const plantilla = plantillas.find((item) => item.name === plantillaNombre);
  const cantidad = useMemo(() => totalVariables(plantilla), [plantilla]);

  useEffect(() => {
    setErrorPlantillas("");
    if (!canalId) return setPlantillas([]);
    void fetch(`/api/meta/templates?canalId=${encodeURIComponent(canalId)}`)
      .then(async (res) => { if (!res.ok) throw new Error("No se pudieron cargar las plantillas aprobadas"); return res.json(); })
      .then((data) =>
        setPlantillas(
          (data.plantillas ?? []).filter(
            (item: Plantilla) => item.status === "APPROVED",
          ),
        ),
      ).catch(() => setErrorPlantillas("No se pudieron cargar las plantillas aprobadas. Revisa el canal e intenta de nuevo."));
  }, [canalId]);

  useEffect(() => {
    setMapeo((actual) =>
      Array.from(
        { length: cantidad },
        (_, i) => actual[i] ?? "nombre_contacto",
      ),
    );
  }, [cantidad]);

  async function guardar() {
    if (!plantilla) return toast("Selecciona una plantilla aprobada", "error");
    const res = await fetch("/api/modulos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clave: "citas",
        config: {
          canalId,
          anticipacionHoras,
          plantilla: { name: plantilla.name, language: plantilla.language },
          mapeoVariables: mapeo,
        },
      }),
    });
    toast(
      res.ok ? "Configuración de Citas guardada" : "No se pudo guardar",
      res.ok ? "ok" : "error",
    );
  }

  return (
    <div className="mt-4 space-y-3 border-t border-border pt-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Duración por defecto de las citas (minutos)</span>
        <input type="number" min={5} max={480} step={1} value={duracionMin} onChange={(evento) => setDuracionMin(Number(evento.target.value))} className="w-32 rounded-lg border p-2" />
      </label>
      <Boton onClick={() => void guardarDuracion()} disabled={guardandoDuracion}>{guardandoDuracion ? "Guardando…" : "Guardar duración"}</Boton>
      {errorPlantillas && <p role="alert" className="text-sm text-destructive">{errorPlantillas}</p>}
      <label className="block space-y-1">
        <span className="text-sm font-medium">Canal de WhatsApp</span>
        <select
          value={canalId}
          onChange={(e) => setCanalId(e.target.value)}
          className="w-full rounded-lg border p-2"
        >
          {canales.map((canal) => (
            <option key={canal.id} value={canal.id}>
              {canal.nombre}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Plantilla aprobada</span>
        <select
          value={plantillaNombre}
          onChange={(e) => setPlantillaNombre(e.target.value)}
          className="w-full rounded-lg border p-2"
        >
          <option value="">Selecciona…</option>
          {plantillas.map((item) => (
            <option key={`${item.name}-${item.language}`} value={item.name}>
              {item.name} · {item.language}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Anticipación (horas)</span>
        <input
          type="number"
          min={1}
          max={168}
          value={anticipacionHoras}
          onChange={(e) => setAnticipacionHoras(Number(e.target.value))}
          className="w-32 rounded-lg border p-2"
        />
      </label>
      {mapeo.map((valor, index) => (
        <label key={index} className="block space-y-1">
          <span className="text-sm font-medium">
            Variable {`{{${index + 1}}}`}
          </span>
          <select
            value={valor}
            onChange={(e) =>
              setMapeo(
                mapeo.map((item, i) =>
                  i === index ? (e.target.value as VariableRecordatorio) : item,
                ),
              )
            }
            className="w-full rounded-lg border p-2"
          >
            {OPCIONES.map((opcion) => (
              <option key={opcion.value} value={opcion.value}>
                {opcion.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      <Boton onClick={guardar}>Guardar recordatorios</Boton>
    </div>
  );
}
