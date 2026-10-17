import type { ChannelProvider } from "./types";
import { makeCloudApiProvider, type CloudConfig } from "./cloudapi";
import { makeApiProvider } from "./api";
import { makeMessengerProvider } from "./messenger";
import { makeInstagramProvider } from "./instagram";

export * from "./types";
export * from "./destinatario";

/**
 * Construye el proveedor con las credenciales del canal del tenant.
 */
export function getProvider(
  proveedor: string,
  config?: unknown,
  _instancia?: string | null
): ChannelProvider {
  if (proveedor === "api") return makeApiProvider(config);
  if (proveedor === "messenger") return makeMessengerProvider(config);
  if (proveedor === "instagram") return makeInstagramProvider(config);
  if (proveedor !== "cloud_api") {
    throw new Error(`proveedor no soportado: ${proveedor}`);
  }
  return makeCloudApiProvider(config as CloudConfig | undefined);
}
