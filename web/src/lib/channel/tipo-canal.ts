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

export function sumarNoLeidosPorTipo(
  grupos: { canalId: bigint | null; noLeidos: number }[],
  canales: { id: bigint; proveedor: string }[],
): Record<TipoCanal, number> {
  const proveedorPorCanal = new Map(canales.map((canal) => [canal.id, canal.proveedor]));
  const conteos: Record<TipoCanal, number> = { whatsapp: 0, messenger: 0, instagram: 0 };
  for (const grupo of grupos) {
    conteos[tipoCanal(grupo.canalId == null ? null : proveedorPorCanal.get(grupo.canalId))] += grupo.noLeidos;
  }
  return conteos;
}

export function nombreVisibleCanal(nombre: string, proveedor?: string | null) {
  if (proveedor === "messenger" && !/\bmessenger\b/i.test(nombre)) return `Messenger · ${nombre}`;
  if (proveedor === "instagram" && !/\binstagram\b/i.test(nombre)) return `Instagram · ${nombre}`;
  return nombre;
}

export function nombreVisibleContacto(nombre: string, _proveedor?: string | null) {
  return nombre;
}
