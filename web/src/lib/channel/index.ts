import type { ChannelProvider } from "./types";
import { evolutionProvider } from "./evolution";
import { makeCloudApiProvider, type CloudConfig } from "./cloudapi";

export * from "./types";

/**
 * Devuelve el proveedor según el canal (tabla canales_whatsapp).
 * Para `cloud_api` se le pasan las credenciales del canal (multi-tenant); si se omiten,
 * cae a las variables de entorno. Evolution ignora `config` (usa su propia config global).
 */
export function getProvider(proveedor: "evolution" | "cloud_api", config?: unknown): ChannelProvider {
  return proveedor === "cloud_api" ? makeCloudApiProvider(config as CloudConfig | undefined) : evolutionProvider;
}
