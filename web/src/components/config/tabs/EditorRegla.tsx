"use client";
import { Boton } from "@/components/ui";
export type OpcionRegla = { id: string; nombre: string };
export type OpcionesRegla = { agentes: OpcionRegla[]; etiquetas: OpcionRegla[]; plantillas: OpcionRegla[]; webhooks: OpcionRegla[] };
export type FilaRegla = { tipo: string; valor: string };
export const TIPOS_CONDICION = [
  ["canal", "Canal"], ["estado", "Estado"], ["etiqueta", "Tiene etiqueta"], ["texto_contiene", "El texto contiene"],
  ["texto_no_contiene", "El texto no contiene"], ["fuera_horario", "Fuera de horario"], ["contacto_nuevo", "Contacto nuevo"],
] as const;
export const TIPOS_ACCION = [
  ["asignar_agente", "Asignar a agente"], ["agregar_etiqueta", "Agregar etiqueta"], ["cambiar_estado", "Cambiar estado"],
  ["enviar_plantilla", "Enviar respuesta rápida"], ["enviar_webhook", "Enviar webhook"],
] as const;
const estados = ["abierta", "pendiente", "cerrada"].map((v) => ({ id: v, nombre: v }));
const canales = [{ id: "cloud_api", nombre: "WhatsApp" }, { id: "messenger", nombre: "Messenger" }, { id: "instagram", nombre: "Instagram" }, { id: "api", nombre: "API" }];
const booleanos = [{ id: "true", nombre: "Sí" }, { id: "false", nombre: "No" }];
const clase = "rounded border border-input bg-background p-2 text-sm w-full";

export function EditorFilasRegla({ filas, cambiar, opciones, acciones = false }: {
  filas: FilaRegla[]; cambiar: (filas: FilaRegla[]) => void; opciones: OpcionesRegla; acciones?: boolean;
}) {
  function valores(tipo: string): OpcionRegla[] | null {
    switch (tipo) {
      case "canal": return canales;
      case "estado": case "cambiar_estado": return estados;
      case "etiqueta": case "agregar_etiqueta": return opciones.etiquetas;
      case "asignar_agente": return opciones.agentes;
      case "enviar_plantilla": return opciones.plantillas;
      case "enviar_webhook": return opciones.webhooks;
      case "fuera_horario": case "contacto_nuevo": return booleanos;
      default: return null;
    }
  }
  const tipos = acciones ? TIPOS_ACCION : TIPOS_CONDICION;
  function actualizar(i: number, fila: FilaRegla) { cambiar(filas.map((f, j) => i === j ? fila : f)); }
  return <fieldset className="space-y-2">
    <legend className="text-sm font-medium">{acciones ? "Acciones (en orden, máximo 5)" : "Condiciones (deben cumplirse todas)"}</legend>
    {filas.map((fila, i) => <div key={i} className="flex flex-wrap gap-2 items-center border border-border p-2 rounded">
      <label className="flex-1 min-w-36"><span className="sr-only">{acciones ? "Acción" : "Condición"} {i + 1}</span>
        <select className={clase} value={fila.tipo} onChange={(e) => actualizar(i, { tipo: e.target.value, valor: valores(e.target.value)?.[0]?.id ?? "" })}>
          {tipos.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
        </select>
      </label>
      <label className="flex-1 min-w-32"><span className="sr-only">Valor {i + 1}</span>
        {valores(fila.tipo) ? <select required className={clase} value={fila.valor} onChange={(e) => actualizar(i, { ...fila, valor: e.target.value })}>
          <option value="" disabled>Seleccionar…</option>
          {valores(fila.tipo)!.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
        </select> : <input required maxLength={300} className={clase} value={fila.valor} onChange={(e) => actualizar(i, { ...fila, valor: e.target.value })} />}
      </label>
      <button type="button" className="text-sm underline" onClick={() => cambiar(filas.filter((_, j) => j !== i))} aria-label={`Quitar ${acciones ? "acción" : "condición"} ${i + 1}`}>Quitar</button>
    </div>)}
    <Boton type="button" disabled={filas.length >= (acciones ? 5 : 10)} onClick={() => cambiar([...filas, { tipo: acciones ? "cambiar_estado" : "canal", valor: acciones ? "pendiente" : "cloud_api" }])}>
      {acciones ? "Agregar acción" : "Agregar condición"}
    </Boton>
  </fieldset>;
}
