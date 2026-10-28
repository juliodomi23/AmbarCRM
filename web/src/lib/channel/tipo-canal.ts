export type TipoCanal = "whatsapp" | "messenger" | "instagram";

export const TIPOS_CANAL: TipoCanal[] = ["whatsapp", "messenger", "instagram"];

export function tipoCanal(proveedor?: string | null): TipoCanal {
  return proveedor === "messenger" || proveedor === "instagram" ? proveedor : "whatsapp";
}

export function nombreVisibleCanal(nombre: string, proveedor?: string | null) {
  if (proveedor === "messenger" && !/\bmessenger\b/i.test(nombre)) return `Messenger · ${nombre}`;
  if (proveedor === "instagram" && !/\binstagram\b/i.test(nombre)) return `Instagram · ${nombre}`;
  return nombre;
}
