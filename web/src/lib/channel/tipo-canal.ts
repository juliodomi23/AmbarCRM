export type TipoCanal = "whatsapp" | "messenger" | "instagram";

export const TIPOS_CANAL: TipoCanal[] = ["whatsapp", "messenger", "instagram"];

export function tipoCanal(proveedor?: string | null): TipoCanal {
  return proveedor === "messenger" || proveedor === "instagram" ? proveedor : "whatsapp";
}

export function tiposDeBandeja(canales: { proveedor: string }[]) {
  const conCanal = TIPOS_CANAL.filter((tipo) => canales.some((canal) => tipoCanal(canal.proveedor) === tipo));
  return {
    disponibles: conCanal.some((tipo) => tipo !== "whatsapp") ? TIPOS_CANAL : conCanal,
    inicial: conCanal[0],
  };
}

export function nombreVisibleCanal(nombre: string, proveedor?: string | null) {
  if (proveedor === "messenger" && !/\bmessenger\b/i.test(nombre)) return `Messenger · ${nombre}`;
  if (proveedor === "instagram" && !/\binstagram\b/i.test(nombre)) return `Instagram · ${nombre}`;
  return nombre;
}
