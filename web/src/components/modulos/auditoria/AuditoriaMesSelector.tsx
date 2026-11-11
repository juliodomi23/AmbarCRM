import Link from "next/link";

const CLASE_FLECHA =
  "grid h-8 w-8 place-items-center rounded-md text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground";

export function AuditoriaMesSelector({
  etiqueta,
  anterior,
  siguiente,
}: {
  etiqueta: string;
  anterior: string;
  siguiente: string;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
      <Link href={`/auditoria?mes=${anterior}`} className={CLASE_FLECHA} aria-label="Mes anterior">
        ‹
      </Link>
      <span className="min-w-36 px-2 text-center text-sm font-medium capitalize text-foreground">{etiqueta}</span>
      <Link href={`/auditoria?mes=${siguiente}`} className={CLASE_FLECHA} aria-label="Mes siguiente">
        ›
      </Link>
    </div>
  );
}
