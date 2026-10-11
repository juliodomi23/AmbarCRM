import Link from "next/link";

export function EmptyState({ titulo, descripcion, accion, href }: { titulo: string; descripcion: string; accion?: string; href?: string }) {
  return (
    <div className="animate-fade-up grid min-h-44 place-items-center rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
      <div>
        <span className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary" aria-hidden="true">◇</span>
        <p className="font-semibold text-foreground">{titulo}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{descripcion}</p>
        {accion && href && (
          <Link href={href} className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition duration-150 hover:bg-primary/90 hover:shadow-glow active:scale-[.98]">
            {accion}
          </Link>
        )}
      </div>
    </div>
  );
}
