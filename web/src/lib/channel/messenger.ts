import type { ChannelProvider } from "./types";

export function makeMessengerProvider(_config?: unknown): ChannelProvider {
  const noDisponible = async () => ({ ok: false, error: "Messenger pendiente de configuración" });
  return { nombre: "messenger", enviarTexto: noDisponible, enviarMedia: noDisponible, normalizarEntrante: () => [] };
}
