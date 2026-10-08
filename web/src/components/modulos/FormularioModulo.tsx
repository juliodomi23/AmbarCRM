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
  tipo: "texto" | "textarea" | "numero" | "dinero" | "fecha" | "seleccion" | "contacto";
  requerido?: boolean;
  opciones?: OpcionCampo[];
  valorInicial?: string;
  ayuda?: string;
};

const CLASE_INPUT = "w-full rounded-lg border bg-card px-3 py-2 text-sm";

function valoresIniciales(campos: CampoFormulario[]) {
  return Object.fromEntries(
    campos.map((campo) => [campo.nombre, campo.valorInicial ?? (campo.tipo === "seleccion" ? campo.opciones?.[0]?.valor ?? "" : "")]),
  );
}

/** Botón + modal de alta para cualquier módulo: lo configura cada página con sus campos y su endpoint.
 *  El servidor valida todo; aquí solo se capturan los datos. */
export function FormularioModulo({
  boton,
  titulo,
  endpoint,
  campos,
}: {
  boton: string;
  titulo: string;
  endpoint: string;
  campos: CampoFormulario[];
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [valores, setValores] = useState<Record<string, string>>(() => valoresIniciales(campos));

  function cambiar(nombre: string, valor: string) {
    setValores((actuales) => ({ ...actuales, [nombre]: valor }));
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const faltante = campos.find((campo) => campo.requerido && !valores[campo.nombre]?.trim());
    if (faltante) return toast(`Falta: ${faltante.etiqueta}`, "error");
    setEnviando(true);
    const cuerpo = Object.fromEntries(Object.entries(valores).filter(([, valor]) => valor.trim() !== ""));
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    const data = await res.json().catch(() => ({}));
    setEnviando(false);
    if (!res.ok) return toast(data.error ?? "No se pudo guardar", "error");
    toast("Guardado");
    setValores(valoresIniciales(campos));
    setAbierto(false);
    router.refresh();
  }

  return (
    <>
      <Boton onClick={() => setAbierto(true)}>{boton}</Boton>
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
              ) : campo.tipo === "textarea" ? (
                <textarea
                  value={valores[campo.nombre]}
                  onChange={(evento) => cambiar(campo.nombre, evento.target.value)}
                  rows={3}
                  className={CLASE_INPUT}
                />
              ) : (
                <input
                  type={campo.tipo === "fecha" ? "date" : campo.tipo === "texto" ? "text" : "number"}
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
