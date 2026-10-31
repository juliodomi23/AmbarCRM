import type { ReactNode, SVGProps } from "react";

type NombreIcono = "vehiculo" | "orden" | "refaccion" | "recordatorio" | "busqueda" | "herramienta" | "reloj" | "check" | "telefono" | "calendario" | "usuario" | "flecha" | "mas" | "vacio" | "dinero" | "subir" | "menu";

const trazos: Record<NombreIcono, ReactNode> = {
  vehiculo: <><path d="m3 11 2-5h14l2 5"/><path d="M5 11h14a2 2 0 0 1 2 2v5H3v-5a2 2 0 0 1 2-2Z"/><path d="M6 18v2m12-2v2M6 14h.01M18 14h.01"/></>,
  orden: <><path d="M8 4h8l2 2h3v15H3V6h3l2-2Z"/><path d="M8 11h8m-8 4h8m-8 4h5"/></>,
  refaccion: <><path d="M14 6a5 5 0 0 0-6.8 6.8L3 17v4h4l4.2-4.2A5 5 0 0 0 18 10l-3 3-4-4 3-3Z"/></>,
  recordatorio: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  busqueda: <><circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 4.5 4.5"/></>,
  herramienta: <><path d="M14 7a5 5 0 0 0-6.8 6.8L3 18v3h4l4.2-4.2A5 5 0 0 0 18 10l-3 3-4-4 3-3Z"/></>,
  reloj: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  telefono: <path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 3a14 14 0 0 1-7-7l3-2-3-6Z"/>,
  calendario: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18m-13 4h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/></>,
  usuario: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  flecha: <><path d="M5 12h14m-6-6 6 6-6 6"/></>,
  mas: <><path d="M12 5v14M5 12h14"/></>,
  vacio: <><path d="M4 8h16l1 11H3L4 8Z"/><path d="M8 8a4 4 0 0 1 8 0m-5 5h2"/></>,
  dinero: <><path d="M3 6h18v13H3z"/><path d="M3 10h18m-10 5h4"/></>,
  subir: <><path d="M12 16V4m-5 5 5-5 5 5"/><path d="M4 20h16"/></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
};

export function TallerIcono({ nombre, className = "h-5 w-5", ...props }: SVGProps<SVGSVGElement> & { nombre: NombreIcono }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" focusable="false" {...props}>{trazos[nombre]}</svg>;
}
