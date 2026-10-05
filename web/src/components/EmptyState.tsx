import Link from "next/link";

export function EmptyState({ titulo, descripcion, accion, href }: { titulo: string; descripcion: string; accion?: string; href?: string }) {
  return <div className="grid min-h-44 place-items-center rounded-xl border border-dashed bg-muted/30 p-6 text-center"><div><span className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-primary/10 text-primary">◇</span><p className="font-semibold">{titulo}</p><p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{descripcion}</p>{accion && href && <Link href={href} className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">{accion}</Link>}</div></div>;
}
