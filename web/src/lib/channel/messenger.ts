import { makeMensajeriaMetaProvider, suscribirPaginaMeta } from "./meta-mensajeria";

export {
  graphMensajeriaMeta as messengerGraph,
  desuscribirPaginaMeta as desuscribirPagina,
  ERROR_DESCONEXION_MESSENGER,
  perfilPaginaMeta as perfilMessenger,
  tipoEnvioMeta as tipoEnvioMessenger,
  normalizarMensajeriaMeta as normalizarMessenger,
} from "./meta-mensajeria";

export const CAMPOS_MESSENGER = ["messages", "message_deliveries", "message_echoes", "message_reads", "standby", "messaging_handovers", "messaging_postbacks"];

export function suscribirPagina(config: Record<string, unknown>) {
  return suscribirPaginaMeta(config, CAMPOS_MESSENGER);
}

export function makeMessengerProvider(config?: unknown) {
  return makeMensajeriaMetaProvider(config);
}
