"use client";

// Embudos: mismo marco que app/(app)/embudos/page.tsx, con el Board y NuevaOportunidad reales.
import Link from "next/link";
import { Board, type Columna } from "@/components/kanban/Board";
import { NuevaOportunidad } from "@/components/kanban/NuevaOportunidad";
import { useNavegacionDemo } from "@/lib/demo/navegacion";
import { useDatos } from "@/lib/demo/usar-almacen";
import { embudosConEtapas } from "@/lib/demo/vistas";

export function PantallaEmbudos() {
  const d = useDatos();
  const { query } = useNavegacionDemo();
  const params = new URLSearchParams(query);
  const embudos = embudosConEtapas(d);
  const activoId = params.get("embudo") ?? embudos[0].id;
  const embudo = embudos.find((e) => e.id === activoId);
  if (!embudo) return <div className="p-8 text-muted-foreground">Embudo no encontrado.</div>;

  const columnas: Columna[] = embudo.etapas.map((e) => ({
    id: e.id,
    nombre: e.nombre,
    color: e.color,
    tipo: e.tipo,
    tarjetas: d.oportunidades
      .filter((o) => o.etapaId === e.id)
      .sort((a, b) => a.orden - b.orden)
      .map((o) => {
        const contacto = d.contactos.find((c) => c.id === o.contactoId)!;
        const conv = d.conversaciones.find((c) => c.contactoId === contacto.id);
        const responsable = d.usuarios.find((u) => u.id === o.responsableId);
        return {
          id: o.id,
          titulo: o.titulo,
          valor: o.valor,
          moneda: o.moneda,
          createdAt: o.createdAt,
          diasEnEtapa: Math.max(0, Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 86400000)),
          conversacionId: conv?.id ?? null,
          contacto: { nombre: contacto.nombre, telefono: contacto.telefono },
          responsable: responsable ? { nombre: responsable.nombre } : null,
        };
      }),
  }));

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          {embudos.map((e) => (
            <Link
              key={e.id}
              href={`/embudos?embudo=${e.id}`}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                e.id === activoId ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {e.nombre}
            </Link>
          ))}
        </div>
        <NuevaOportunidad embudoId={embudo.id} abrirInicial={params.get("nueva") === "1"} etapas={embudo.etapas.map((e) => ({ id: e.id, nombre: e.nombre }))} />
      </div>
      <div className="flex-1 overflow-hidden">
        {/* La clave fuerza a releer las tarjetas del almacén tras cada cambio (equivale al refresh del servidor). */}
        <Board key={`${embudo.id}-${d.oportunidades.length}`} columnasIniciales={columnas} />
      </div>
    </div>
  );
}
