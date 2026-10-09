"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, Modal } from "@/components/ui";
import { toast } from "@/components/Toaster";
import { SelectorContacto } from "@/components/modulos/SelectorContacto";

export type OpcionCampo = { valor: string; etiqueta: string };

export type CampoFormulario = {
  nombre: string;
  etiqueta: string;
  tipo: "texto" | "textarea" | "numero" | "dinero" | "fecha" | "hora" | "seleccion" | "multiseleccion" | "contacto";
  requerido?: boolean;
  opciones?: OpcionCampo[];
  valorInicial?: string;
  ayuda?: string;
};

const CLASE_INPUT = "w-full rounded-lg border bg-card px-3 py-2 text-sm";

export type AccionRapida = { etiqueta: string; cuerpo: Record<string, string> };

/** Edición por fila en los listados: la página la define una vez; cada fila aporta su endpoint y valores. */
export type ConfigEdicion = { titulo: string; campos: CampoFormulario[]; eliminar?: string; acciones?: AccionRapida[] };
export type EdicionFila = { endpoint: string; valores: Record<string, string> };

function valoresIniciales(campos: CampoFormulario[], valores?: Record<string, string>) {
  return Object.fromEntries(
    campos.map((campo) => [
      campo.nombre,
      valores?.[campo.nombre] ?? campo.valorInicial ?? (campo.tipo === "seleccion" ? campo.opciones?.[0]?.valor ?? "" : ""),
    ]),
  );
}

/** Botón + modal de alta o edición para cualquier módulo: lo configura cada página con sus campos y su
 *  endpoint. En edición (`valores`) usa PATCH y puede borrar o lanzar acciones rápidas. El servidor valida todo. */
export function FormularioModulo({
  boton,
  titulo,
  endpoint,
  campos,
  valores: valoresGuardados,
  eliminar,
  acciones = [],
  discreto = false,
}: {
  boton: string;
  titulo: string;
  endpoint: string;
  campos: CampoFormulario[];
  valores?: Record<string, string>;
  eliminar?: string;
  acciones?: AccionRapida[];
  discreto?: boolean;
}) {
  const router = useRouter();
  const edicion = valoresGuardados !== undefined;
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [valores, setValores] = useState<Record<string, string>>(() => valoresIniciales(campos, valoresGuardados));

  function cambiar(nombre: string, valor: string) {
    setValores((actuales) => ({ ...actuales, [nombre]: valor }));
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const faltante = campos.find((campo) => campo.requerido && !valores[campo.nombre]?.trim());
    if (faltante) return toast(`Falta: ${faltante.etiqueta}`, "error");
    // En edición se mandan también los vacíos, para poder borrar un dato.
    const cuerpo = edicion
      ? valores
      : Object.fromEntries(Object.entries(valores).filter(([, valor]) => valor.trim() !== ""));
    await solicitar(edicion ? "PATCH" : "POST", cuerpo, "Guardado");
  }

  async function solicitar(metodo: "POST" | "PATCH" | "DELETE", cuerpo: Record<string, string> | null, exito: string) {
    setEnviando(true);
    const res = await fetch(endpoint, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    setEnviando(false);
    setConfirmarBorrado(false);
    if (!res.ok) return toast(data.error ?? "No se pudo completar", "error");
    toast(exito);
    if (!edicion) setValores(valoresIniciales(campos));
    setAbierto(false);
    router.refresh();
  }

  return (
    <>
      {discreto ? (
        <button type="button" onClick={() => setAbierto(true)} className="text-xs font-medium text-primary hover:underline">
          {boton}
        </button>
      ) : (
        <Boton onClick={() => setAbierto(true)}>{boton}</Boton>
      )}
      <Modal abierto={abierto} onClose={() => setAbierto(false)} titulo={titulo}>
        <form onSubmit={enviar} className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          {campos.map((campo) => (
            <label key={campo.nombre} className="block space-y-1">
              <span className="text-sm font-medium">
                {campo.etiqueta}
                {campo.requerido && <span className="text-red-600"> *</span>}
              </span>
              {campo.tipo === "contacto" ? (
                <SelectorContacto valor={valores[campo.nombre]} onChange={(id) => cambiar(campo.nombre, id)} />
              ) : campo.tipo === "seleccion" ? (
                <select
                  value={valores[campo.nombre]}
                  onChange={(evento) => cambiar(campo.nombre, evento.target.value)}
                  className={CLASE_INPUT}
                >
                  {campo.opciones?.map((opcion) => (
                    <option key={opcion.valor} value={opcion.valor}>
                      {opcion.etiqueta}
                    </option>
                  ))}
                </select>
              ) : campo.tipo === "multiseleccion" ? (
                <div className="space-y-1 rounded-lg border p-2">
                  {campo.opciones?.map((opcion) => {
                    const elegidos = (valores[campo.nombre] ?? "").split(",").filter(Boolean);
                    const marcado = elegidos.includes(opcion.valor);
                    return (
                      <label key={opcion.valor} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() =>
                            cambiar(campo.nombre, (marcado ? elegidos.filter((v) => v !== opcion.valor) : [...elegidos, opcion.valor]).join(","))
                          }
                        />
                        {opcion.etiqueta}
                      </label>
                    );
                  })}
                </div>
              ) : campo.tipo === "textarea" ? (
                <textarea
                  value={valores[campo.nombre]}
                  onChange={(evento) => cambiar(campo.nombre, evento.target.value)}
                  rows={3}
                  className={CLASE_INPUT}
                />
              ) : (
                <input
                  type={campo.tipo === "fecha" ? "date" : campo.tipo === "hora" ? "time" : campo.tipo === "texto" ? "text" : "number"}
                  step={campo.tipo === "dinero" ? "0.01" : campo.tipo === "numero" ? "1" : undefined}
                  min={campo.tipo === "dinero" || campo.tipo === "numero" ? "0" : undefined}
                  value={valores[campo.nombre]}
                  onChange={(evento) => cambiar(campo.nombre, evento.target.value)}
                  className={CLASE_INPUT}
                />
              )}
              {campo.ayuda && <span className="block text-xs text-muted-foreground">{campo.ayuda}</span>}
            </label>
          ))}
          {(acciones.length > 0 || eliminar) && (
            <div className="flex flex-wrap gap-2 border-t pt-3">
              {acciones.map((accion) => (
                <Boton key={accion.etiqueta} type="button" variante="ghost" disabled={enviando}
                  onClick={() => solicitar("PATCH", accion.cuerpo, accion.etiqueta)}>
                  {accion.etiqueta}
                </Boton>
              ))}
              {eliminar && !confirmarBorrado && (
                <Boton type="button" variante="ghost" onClick={() => setConfirmarBorrado(true)}>
                  {eliminar}
                </Boton>
              )}
              {eliminar && confirmarBorrado && (
                <Boton type="button" variante="danger" disabled={enviando}
                  onClick={() => solicitar("DELETE", null, "Eliminado")}>
                  ¿Seguro? Sí, {eliminar.toLowerCase()}
                </Boton>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Boton type="button" variante="ghost" onClick={() => setAbierto(false)}>
              Cancelar
            </Boton>
            <Boton type="submit" disabled={enviando}>
              {enviando ? "Guardando…" : "Guardar"}
            </Boton>
          </div>
        </form>
      </Modal>
    </>
  );
}
