import type { ChannelProvider } from "./types";
import { makeCloudApiProvider, type CloudConfig } from "./cloudapi";

export * from "./types";

/**
 * Construye el canal oficial de Meta con las credenciales cifradas del tenant.
 */
export function getProvider(
  proveedor: string,
  config?: unknown,
  _instancia?: string | null
): ChannelProvider {
  if (proveedor !== "cloud_api") {
    throw new Error(`proveedor de WhatsApp no soportado: ${proveedor}`);
  }
  return makeCloudApiProvider(config as CloudConfig | undefined);
}
