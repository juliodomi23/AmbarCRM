"use client";

import { useEffect, useState } from "react";

type Campo = {
  clave: string;
  etiqueta: string;
  tipo: "texto" | "numero" | "fecha" | "opcion" | "si_no";
  opciones: string[];
};

export function CamposPersonalizadosForm({
  entidad,
  valores,
  onChange,
}: {
  entidad: "contacto" | "oportunidad";
  valores: Record<string, unknown>;
  onChange: (campos: Record<string, unknown>) => void;
}) {
  const [campos, setCampos] = useState<Campo[]>([]);

  useEffect(() => {
    void fetch(`/api/campos-personalizados?entidad=${entidad}`)
      .then((res) => res.json())
      .then((data) =>
        setCampos((data.campos ?? []).filter((campo: any) => campo.activo)),
      );
  }, [entidad]);

  if (!campos.length) return null;

  function actualizar(clave: string, valor: unknown) {
    onChange({ ...valores, [clave]: valor });
  }

  return (
    <fieldset className="space-y-3 rounded-lg border border-border p-3">
      <legend className="px-1 text-xs font-medium uppercase text-muted-foreground">
        Campos personalizados
      </legend>
      {campos.map((campo) => (
        <label key={campo.clave} className="block space-y-1">
          <span className="text-sm font-medium text-muted-foreground">
            {campo.etiqueta}
          </span>
          {campo.tipo === "si_no" ? (
            <input
              type="checkbox"
              checked={Boolean(valores[campo.clave])}
              onChange={(event) =>
                actualizar(campo.clave, event.target.checked)
              }
              className="h-4 w-4 accent-primary"
            />
          ) : campo.tipo === "opcion" ? (
            <select
              value={String(valores[campo.clave] ?? "")}
              onChange={(event) => actualizar(campo.clave, event.target.value)}
              className="w-full rounded-lg border border-input px-3 py-2 text-sm"
            >
              <option value="">Selecciona…</option>
              {campo.opciones.map((opcion) => (
                <option key={opcion}>{opcion}</option>
              ))}
            </select>
          ) : (
            <input
              type={
                campo.tipo === "numero"
                  ? "number"
                  : campo.tipo === "fecha"
                    ? "date"
                    : "text"
              }
              value={String(valores[campo.clave] ?? "")}
              onChange={(event) =>
                actualizar(
                  campo.clave,
                  campo.tipo === "numero" && event.target.value
                    ? Number(event.target.value)
                    : event.target.value,
                )
              }
              className="w-full rounded-lg border border-input px-3 py-2 text-sm"
            />
          )}
        </label>
      ))}
    </fieldset>
  );
}
