export type TipoCanal = "whatsapp" | "messenger" | "instagram";

export const TIPOS_CANAL: TipoCanal[] = ["whatsapp", "messenger", "instagram"];

export function tipoCanal(proveedor?: string | null): TipoCanal {
  return proveedor === "messenger" || proveedor === "instagram" ? proveedor : "whatsapp";
}
