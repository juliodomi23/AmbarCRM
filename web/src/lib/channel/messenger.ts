import { CAMPOS_MESSENGER_META, makeMensajeriaMetaProvider, suscribirPaginaMeta } from "./meta-mensajeria";

export {
  graphMensajeriaMeta as messengerGraph,
  desuscribirPaginaMeta as desuscribirPagina,
  ERROR_DESCONEXION_MESSENGER,
  perfilPaginaMeta as perfilMessenger,
  tipoEnvioMeta as tipoEnvioMessenger,
  normalizarMensajeriaMeta as normalizarMessenger,
} from "./meta-mensajeria";

export const CAMPOS_MESSENGER = CAMPOS_MESSENGER_META;

export function suscribirPagina(config: Record<string, unknown>, canalId?: bigint) {
  return suscribirPaginaMeta(config, CAMPOS_MESSENGER, canalId);
}

export function makeMessengerProvider(config?: unknown) {
  return makeMensajeriaMetaProvider(config);
}
