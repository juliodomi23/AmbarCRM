/** Lógica pura del módulo de lealtad (sin base de datos ni red), probada en check-lealtad.ts. */

export type ConexionAurum = {
  slug: string;
  claveCifrada: string;
  estado: "ok" | "error";
  error?: string;
};

export type ClienteAurum = {
  token: string;
  name: string;
  phone: string;
  stamps: number;
  rewards: number;
  pending_rewards: number;
};

/** Aurum guarda el teléfono como lo escribió el cliente; AmbarCRM con lada (521…). Se comparan los últimos 10 dígitos. */
export function diezDigitos(telefono: string | null | undefined) {
  const digitos = String(telefono ?? "").replace(/\D/g, "");
  return digitos.length >= 10 ? digitos.slice(-10) : null;
}

export function buscarCliente(clientes: ClienteAurum[], telefono: string | null | undefined) {
  const buscado = diezDigitos(telefono);
  if (!buscado) return null;
  return clientes.find((cliente) => diezDigitos(cliente.phone) === buscado) ?? null;
}

export function slugValido(valor: unknown) {
  const slug = String(valor ?? "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-]{1,60}$/.test(slug) ? slug : null;
}

/** Nunca se manda al navegador la clave (ni cifrada) ni se deja sobrescribir desde la configuración libre. */
export function configSinSecretos(config: Record<string, unknown>) {
  const aurum = config.aurum as ConexionAurum | undefined;
  if (!aurum) return config;
  return { ...config, aurum: { slug: aurum.slug, estado: aurum.estado, error: aurum.error } };
}

/** Lo que ve el agente: nunca el token de la tarjeta (con él se puede sellar por NFC o borrar la cuenta). */
export function tarjetaPublica(cliente: ClienteAurum) {
  return {
    nombre: cliente.name,
    sellos: cliente.stamps,
    premiosGanados: cliente.rewards,
    premiosPendientes: cliente.pending_rewards,
  };
}

export type PlantillaPremio = { name: string; language: string };

/** Cómo avisar del premio: texto libre si la ventana de 24 h está abierta (no se cobra
 *  plantilla), plantilla aprobada si está cerrada, y si no hay plantilla, solo la nota interna. */
export function formaDeAviso(plantilla: PlantillaPremio | null | undefined, ventanaAbierta: boolean) {
  if (ventanaAbierta) return "texto" as const;
  return plantilla?.name && plantilla.language ? ("plantilla" as const) : ("nota" as const);
}

export function textoPremio(nombre: string, premios: string[]) {
  const primerNombre = nombre.trim().split(/\s+/)[0] || "";
  return `¡Felicidades${primerNombre ? ` ${primerNombre}` : ""}! Ganaste: ${premios.join(", ")}. Muéstralo en tu próxima visita para canjearlo. 🎁`;
}
