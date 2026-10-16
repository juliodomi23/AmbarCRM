import type { ChannelProvider } from "./types";

export function makeApiProvider(_config?: unknown): ChannelProvider {
  const noDisponible = async () => ({ ok: false, error: "canal API pendiente de configuración" });
  return { nombre: "api", enviarTexto: noDisponible, enviarMedia: noDisponible, normalizarEntrante: () => [] };
}
