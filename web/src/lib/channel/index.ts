import type { ChannelProvider } from "./types";
import { makeEvolutionProvider } from "./evolution";
import { makeCloudApiProvider, type CloudConfig } from "./cloudapi";
import { makeYCloudProvider, type YCloudConfig } from "./ycloud";

export * from "./types";

/**
 * Devuelve el proveedor según el canal (tabla canales_whatsapp).
 * - `cloud_api`: recibe las credenciales del canal (`config`); sin ellas cae al env.
 * - `evolution`: recibe la `instancia` del canal (multi-tenant); sin ella cae a EVOLUTION_INSTANCE.
 */
export function getProvider(
  proveedor: "evolution" | "cloud_api" | "ycloud",
  config?: unknown,
  instancia?: string | null
): ChannelProvider {
  if (proveedor === "cloud_api") return makeCloudApiProvider(config as CloudConfig | undefined);
  if (proveedor === "ycloud") return makeYCloudProvider(config as YCloudConfig | undefined, instancia ?? undefined);
  return makeEvolutionProvider(instancia);
}
