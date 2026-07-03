import type { ChannelProvider } from "./types";
import { makeEvolutionProvider } from "./evolution";
import { makeCloudApiProvider, type CloudConfig } from "./cloudapi";

export * from "./types";

/**
 * Devuelve el proveedor según el canal (tabla canales_whatsapp).
 * - `cloud_api`: recibe las credenciales del canal (`config`); sin ellas cae al env.
 * - `evolution`: recibe la `instancia` del canal (multi-tenant); sin ella cae a EVOLUTION_INSTANCE.
 */
export function getProvider(
  proveedor: "evolution" | "cloud_api",
  config?: unknown,
  instancia?: string | null
): ChannelProvider {
  return proveedor === "cloud_api"
    ? makeCloudApiProvider(config as CloudConfig | undefined)
    : makeEvolutionProvider(instancia);
}
