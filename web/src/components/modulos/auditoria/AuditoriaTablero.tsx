import { CLAVES_COLOR, COLORES_AUDITORIA, type ColorAuditoria } from "@/lib/auditoria";
import { TarjetaColaborador } from "@/components/modulos/auditoria/TarjetaColaborador";

export type ColaboradorTablero = {
  id: string;
  nombre: string;
  puesto?: string | null;
  color?: string | null;
  nota?: string | null;
};

export type AreaTablero = {
  clave: string;
  nombre: string;
  descripcion: string;
  total: number;
  resumen: Record<ColorAuditoria, number>;
  colaboradores: ColaboradorTablero[];
};

function ResumenColores({ resumen }: { resumen: Record<ColorAuditoria, number> }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {CLAVES_COLOR.map((clave) => {
        const definicion = COLORES_AUDITORIA[clave];
        return (
          <span
            key={clave}
            className="inline-flex items-center gap-1 rounded-full bg-muted/70 px-2 py-0.5 text-[11px] text-muted-foreground"
            title={definicion.titulo}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${definicion.punto}`} aria-hidden="true" />
            {resumen[clave] ?? 0}
          </span>
        );
      })}
    </div>
  );
}

export function AuditoriaTablero({
  areas,
  mes,
  colaboradorSeleccionado,
}: {
  areas: AreaTablero[];
  mes: string;
  colaboradorSeleccionado?: string | null;
}) {
  return (
    <div className="space-y-4">
      {areas.map((area) => (
        <section key={area.clave} className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{area.nombre}</h2>
              <p className="text-xs text-muted-foreground">{area.descripcion}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{area.total} evaluaciones</span>
              <ResumenColores resumen={area.resumen} />
            </div>
          </div>
          {area.colaboradores.length ? (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {area.colaboradores.map((colaborador) => (
                <TarjetaColaborador
                  key={colaborador.id}
                  {...colaborador}
                  mes={mes}
                  seleccionado={colaboradorSeleccionado === colaborador.id}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border bg-muted/20 p-3 text-xs text-muted-foreground">
              Sin evaluaciones registradas en este periodo.
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
