import Link from "next/link";
import { Badge, type TonoBadge } from "@/components/ui";
import { definicionColor } from "@/lib/auditoria";

export type FilaHistorial = {
  id: string;
  periodo: string;
  area: string;
  color: string;
  nota?: string | null;
  evaluador?: string | null;
};

export function AuditoriaHistorial({
  nombre,
  filas,
  mes,
}: {
  nombre: string;
  filas: FilaHistorial[];
  mes: string;
}) {
  return (
    <section id="historial" className="scroll-mt-20 rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Historial de {nombre}</h2>
          <p className="text-xs text-muted-foreground">Evaluaciones registradas, de la más reciente a la más antigua.</p>
        </div>
        <Link href={`/auditoria?mes=${mes}`} className="text-xs font-medium text-primary hover:underline">
          Cerrar historial
        </Link>
      </div>
      {filas.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Periodo</th>
                <th className="px-4 py-2 font-medium">Área</th>
                <th className="px-4 py-2 font-medium">Semáforo</th>
                <th className="px-4 py-2 font-medium">Nota</th>
                <th className="px-4 py-2 font-medium">Evaluador</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((fila) => {
                const definicion = definicionColor(fila.color);
                return (
                  <tr key={fila.id} className="border-t border-border/70">
                    <td className="whitespace-nowrap px-4 py-2 capitalize text-foreground">{fila.periodo}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{fila.area}</td>
                    <td className="whitespace-nowrap px-4 py-2">
                      {definicion ? (
                        <Badge tono={definicion.tono as TonoBadge} punto>
                          {definicion.titulo}
                        </Badge>
                      ) : (
                        fila.color
                      )}
                    </td>
                    <td className="min-w-48 px-4 py-2 text-muted-foreground">{fila.nota || "—"}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{fila.evaluador || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-4 text-sm text-muted-foreground">Este colaborador todavía no tiene evaluaciones.</p>
      )}
    </section>
  );
}
