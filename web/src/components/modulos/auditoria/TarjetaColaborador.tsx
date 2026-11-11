import Link from "next/link";
import { Badge, type TonoBadge } from "@/components/ui";
import { definicionColor } from "@/lib/auditoria";

export function TarjetaColaborador({
  id,
  nombre,
  puesto,
  color,
  nota,
  mes,
  seleccionado,
}: {
  id: string;
  nombre: string;
  puesto?: string | null;
  color?: string | null;
  nota?: string | null;
  mes: string;
  seleccionado?: boolean;
}) {
  const definicion = color ? definicionColor(color) : null;
  return (
    <Link
      href={`/auditoria?mes=${mes}&colaborador=${id}#historial`}
      className={`block rounded-lg border bg-background/50 p-3 transition hover:border-primary/40 hover:bg-muted/40 ${
        seleccionado ? "border-primary/60 ring-1 ring-primary/20" : "border-border/70"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{nombre}</p>
          {puesto && <p className="truncate text-xs text-muted-foreground">{puesto}</p>}
        </div>
        {definicion ? (
          <Badge tono={definicion.tono as TonoBadge} punto>
            {definicion.titulo}
          </Badge>
        ) : (
          <Badge tono="neutral">Sin evaluación</Badge>
        )}
      </div>
      {nota && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{nota}</p>}
    </Link>
  );
}
