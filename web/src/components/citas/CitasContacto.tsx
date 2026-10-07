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

  useEffect(() => {
    const desde = new Date();
    const hasta = new Date(desde.getTime() + 180 * 86_400_000);
    void fetch(
      `/api/citas?contactoId=${contactoId}&desde=${desde.toISOString()}&hasta=${hasta.toISOString()}`,
    )
      .then((res) => (res.ok ? res.json() : { citas: [] }))
      .then((data) => setCitas(data.citas ?? []));
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
          <Link
            href={`/contactos/${contactoId}/expediente`}
            className="text-xs font-medium text-primary"
          >
            Expediente
          </Link>
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
