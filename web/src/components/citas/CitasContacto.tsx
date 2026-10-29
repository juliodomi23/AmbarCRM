"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ZONA_CITAS } from "@/lib/citas";

export function CitasContacto({
  contactoId,
  conversacionId,
}: {
  contactoId: string;
  conversacionId?: string;
}) {
  const [zona, setZona] = useState(ZONA_CITAS);
  const [error, setError] = useState("");
  const [citas, setCitas] = useState<any[]>([]);
  const [moduloInactivo, setModuloInactivo] = useState(false);
  const [tipoFicha, setTipoFicha] = useState<"clientes" | "pacientes" | null>(null);

  useEffect(() => {
    let vigente = true;
    setModuloInactivo(false);
    void (async () => {
      try {
        const desde = new Date();
        const todas = [];
        for (let bloque = 0; bloque < 3; bloque++) {
          const inicio = new Date(+desde + bloque * 60 * 86400000);
          const hasta = new Date(+inicio + 60 * 86400000);
          const res = await fetch(`/api/citas?contactoId=${contactoId}&desde=${inicio.toISOString()}&hasta=${hasta.toISOString()}`);
          const data = await res.json();
          if (res.status === 404 && data.error === "módulo no activo") {
            if (vigente) setModuloInactivo(true);
            return;
          }
          if (!res.ok) throw new Error(data.error ?? "No se pudieron cargar las citas");
          todas.push(...data.citas.filter((c: { estado: string }) => !["cancelada", "no_asistio", "completada"].includes(c.estado)));
          if (vigente) setZona(data.zona ?? ZONA_CITAS);
          if (todas.length >= 3) break;
        }
        if (vigente) { setCitas(todas); setError(""); }
      } catch { if (vigente) setError("No se pudieron cargar las próximas citas"); }
    })();
    void fetch(`/api/pacientes?contactoId=${contactoId}`)
      .then(async (respuesta) => {
        if (respuesta.ok) {
          const data = await respuesta.json();
          if ((data.pacientes ?? []).length > 0) setTipoFicha("pacientes");
          return;
        }
        const clientes = await fetch(`/api/clientes?contactoId=${contactoId}`);
        if (!clientes.ok) return;
        const data = await clientes.json();
        if ((data.clientes ?? []).length > 0) setTipoFicha("clientes");
      }).catch(() => null);
    return () => { vigente = false; };
  }, [contactoId]);

  const query = new URLSearchParams({ contactoId });
  if (conversacionId) query.set("conversacionId", conversacionId);
  if (moduloInactivo) return null;
  return (
    <section className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase text-muted-foreground">
          Próximas citas
        </span>
        <div className="flex gap-3">
          {tipoFicha && (
            <Link
              href={`/${tipoFicha}/${contactoId}`}
              className="text-xs font-medium text-primary"
            >
              {tipoFicha === "pacientes" ? "Paciente" : "Cliente"}
            </Link>
          )}
          <Link
            href={`/citas?${query}`}
            className="text-xs font-medium text-primary"
          >
            + Crear cita
          </Link>
        </div>
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      {!error && citas.length === 0 && (
        <p className="text-xs text-muted-foreground">Sin próximas citas.</p>
      )}
      {citas.slice(0, 3).map((cita) => (
        <div key={cita.id} className="rounded-md bg-muted px-2 py-1.5 text-xs">
          <p className="font-medium">{cita.titulo}</p>
          <p className="text-muted-foreground">
            {new Intl.DateTimeFormat("es-MX", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: zona,
            }).format(new Date(cita.inicio))}
          </p>
        </div>
      ))}
    </section>
  );
}
