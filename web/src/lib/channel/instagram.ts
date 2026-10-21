import {
  graphMensajeriaMeta, suscribirPaginaMeta, desuscribirPaginaMeta,
  makeMensajeriaMetaProvider, normalizarMensajeriaMeta,
} from "./meta-mensajeria";

export { tipoEnvioMeta as tipoEnvioInstagram } from "./meta-mensajeria";
export const CAMPOS_INSTAGRAM = ["messages"];
export const ERROR_DESCONEXION_INSTAGRAM = "No se pudo cancelar la suscripción de Instagram en Facebook. El canal se conservó; vuelve a intentarlo.";

export function suscribirCuenta(config: Record<string, unknown>, canalId?: bigint) {
  return suscribirPaginaMeta(config, CAMPOS_INSTAGRAM, canalId);
}

export async function desuscribirCuenta(config: Record<string, unknown>, canalId: bigint) {
  try { return await desuscribirPaginaMeta(config, canalId); }
  catch { throw new Error(ERROR_DESCONEXION_INSTAGRAM); }
}

export async function perfilInstagram(config: Record<string, unknown>, identificador: string) {
  try {
    const data = await graphMensajeriaMeta(config, `${encodeURIComponent(identificador)}?fields=name,username,profile_pic`);
    return {
      nombre: typeof data.name === "string" ? data.name : typeof data.username === "string" ? data.username : undefined,
      avatarUrl: typeof data.profile_pic === "string" && data.profile_pic.startsWith("https://") ? data.profile_pic : undefined,
    };
  } catch { return {}; }
}

export function normalizarInstagram(payload: unknown, appId?: string) {
  const entrada = payload as { entry?: unknown[] } | null;
  if (!Array.isArray(entrada?.entry)) return [];
  const tipos = new Set(["image", "audio", "video", "file"]);
  const entry = entrada.entry.filter((e): e is Record<string, unknown> => !!e && typeof e === "object").map((e) => ({
    ...e,
    messaging: (Array.isArray(e.messaging) ? e.messaging : []).filter((v) => !!v && typeof v === "object").map((evento) => {
      const m = evento.message;
      if (!m || typeof m !== "object") return evento;
      const adjuntos: { type?: string; payload?: { url?: unknown } }[] = Array.isArray(m.attachments) ? m.attachments : [];
      const compatibles = adjuntos.filter((a) => a && typeof a.type === "string" && tipos.has(a.type) && typeof a.payload?.url === "string");
      const marcadores = adjuntos.length > compatibles.length ? "[Adjunto de Instagram no compatible: contenido compartido]" : "";
      const texto = [typeof m.text === "string" ? m.text : "", marcadores].filter(Boolean).join("\n");
      return { ...evento, message: { ...m, attachments: compatibles,
        text: texto || (compatibles.length ? undefined : "[Mensaje de Instagram sin contenido compatible]") } };
    }),
  }));
  return normalizarMensajeriaMeta({ entry }, appId);
}

export function makeInstagramProvider(config?: unknown) {
  return makeMensajeriaMetaProvider(config, { proveedor: "instagram", normalizar: normalizarInstagram, maxTexto: 1000 });
}
