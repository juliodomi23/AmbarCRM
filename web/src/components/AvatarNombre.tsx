const PALETA = [
  "bg-primary/15 text-primary", "bg-info/15 text-info", "bg-success/15 text-success",
  "bg-warning/15 text-warning", "bg-accent text-accent-foreground"
];

export function claseAvatar(nombre: string) {
  const indice = [...nombre].reduce((total, caracter) => total + caracter.charCodeAt(0), 0) % PALETA.length;
  return PALETA[indice];
}

export function AvatarNombre({ nombre, className = "h-9 w-9" }: { nombre: string; className?: string }) {
  return <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-full text-xs font-bold ${claseAvatar(nombre)} ${className}`}>{nombre.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?"}</span>;
}
