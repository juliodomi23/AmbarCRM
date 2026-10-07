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
  const [citas, setCitas] = useState<any[]>([]);
  const [tipoFicha, setTipoFicha] = useState<"clientes" | "pacientes" | null>(null);

  useEffect(() => {
    const desde = new Date();
    const hasta = new Date(desde.getTime() + 180 * 86_400_000);
    void fetch(
      `/api/citas?contactoId=${contactoId}&desde=${desde.toISOString()}&hasta=${hasta.toISOString()}`,
    )
      .then((res) => (res.ok ? res.json() : { citas: [] }))
      .then((data) => setCitas(data.citas ?? []));
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
      });
  }, [contactoId]);

  const query = new URLSearchParams({ contactoId });
  if (conversacionId) query.set("conversacionId", conversacionId);
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
      {citas.length === 0 && (
        <p className="text-xs text-muted-foreground">Sin próximas citas.</p>
      )}
      {citas.slice(0, 3).map((cita) => (
        <div key={cita.id} className="rounded-md bg-muted px-2 py-1.5 text-xs">
          <p className="font-medium">{cita.titulo}</p>
          <p className="text-muted-foreground">
            {new Intl.DateTimeFormat("es-MX", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: ZONA_CITAS,
            }).format(new Date(cita.inicio))}
          </p>
        </div>
      ))}
    </section>
  );
}
