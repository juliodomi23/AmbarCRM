import { IconoCanal } from "@/components/chat/IconoCanal";

const PALETA = [
  "bg-primary/15 text-primary", "bg-info/15 text-info", "bg-success/15 text-success",
  "bg-warning/15 text-warning", "bg-accent text-accent-foreground"
];

export function claseAvatar(nombre: string) {
  const indice = [...nombre].reduce((total, caracter) => total + caracter.charCodeAt(0), 0) % PALETA.length;
  return PALETA[indice];
}

export function AvatarNombre({ nombre, url, proveedor, className = "h-9 w-9" }: { nombre: string; url?: string | null; proveedor?: string | null; className?: string }) {
  return <span aria-hidden="true" className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full text-xs font-bold ${claseAvatar(nombre)} ${className}`}>
    {proveedor && /^\d+$/.test(nombre.trim())
      ? <IconoCanal proveedor={proveedor} />
      : nombre.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?"}
    {url?.startsWith("https://") && (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
    )}
  </span>;
}
