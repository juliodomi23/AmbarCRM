"use client";

import { Campo } from "@/components/ui";

export function DatosPersonalesFicha({ clinica, fechaNacimiento, sexo, onChange }: {
  clinica: boolean;
  fechaNacimiento: string;
  sexo: string;
  onChange: (campo: "fechaNacimiento" | "sexo", valor: string) => void;
}) {
  const campos = <div className="grid gap-3 sm:grid-cols-2">
    <Campo label="Fecha de nacimiento" type="date" max={new Date().toISOString().slice(0, 10)} value={fechaNacimiento} onChange={(e) => onChange("fechaNacimiento", e.target.value)} />
    <Campo label="Sexo" value={sexo} onChange={(e) => onChange("sexo", e.target.value)} />
  </div>;
  if (clinica) return campos;
  return <details className="rounded-lg border border-border p-3">
    <summary className="min-h-8 cursor-pointer text-sm font-medium text-muted-foreground">Datos personales (opcional)</summary>
    <div className="pt-3">{campos}</div>
  </details>;
}
