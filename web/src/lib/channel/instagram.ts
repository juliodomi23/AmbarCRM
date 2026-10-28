import {
  graphMensajeriaMeta, suscribirPaginaMeta, desuscribirPaginaMeta,
  makeMensajeriaMetaProvider, normalizarMensajeriaMeta,
} from "./meta-mensajeria";

export { tipoEnvioMeta as tipoEnvioInstagram } from "./meta-mensajeria";
export const CAMPOS_INSTAGRAM = ["messages"];
export const ERROR_DESCONEXION_INSTAGRAM = "No se pudo cancelar la suscripción de Instagram. El canal se conservó; vuelve a intentarlo.";

export async function suscribirCuenta(config: Record<string, unknown>, canalId?: bigint) {
  if (config.login === "instagram") {
    const respuesta = await graphMensajeriaMeta(config, "me/subscribed_apps", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscribed_fields: CAMPOS_INSTAGRAM }),
    });
    if (respuesta.success !== true) throw new Error("Instagram no confirmó la suscripción");
    return respuesta;
  }
  await suscribirPaginaMeta(config, CAMPOS_INSTAGRAM, canalId);
  const respuesta = await graphMensajeriaMeta(config, `${config.instagramId}/subscribed_apps`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscribed_fields: CAMPOS_INSTAGRAM }),
  });
  if (respuesta.success !== true) throw new Error("Meta no confirmó la suscripción de la cuenta de Instagram");
  return respuesta;
}

export async function desuscribirCuenta(config: Record<string, unknown>, canalId: bigint) {
  try {
    if (config.login === "instagram") {
      try {
        const respuesta = await graphMensajeriaMeta(config, "me/subscribed_apps", { method: "DELETE" });
        if (respuesta.success !== true) throw new Error(ERROR_DESCONEXION_INSTAGRAM);
        return { desuscrito: true };
      } catch (error) {
        const datos = error as { code?: number; httpStatus?: number };
        if (datos.code === 190 || datos.code === 803 || datos.httpStatus === 404) return { desuscrito: false, motivo: "El token venció o la cuenta ya no existe; se retiró el canal local." };
        throw error;
      }
    }
    if (typeof config.instagramId !== "string" || !/^\d{1,40}$/.test(config.instagramId)) throw new Error(ERROR_DESCONEXION_INSTAGRAM);
    try {
      const respuesta = await graphMensajeriaMeta(config, `${config.instagramId}/subscribed_apps`, { method: "DELETE" });
      if (respuesta.success !== true) throw new Error(ERROR_DESCONEXION_INSTAGRAM);
    } catch (error) {
      const datos = error as { code?: number; httpStatus?: number };
      if (datos.httpStatus == null || datos.httpStatus === 429 || datos.httpStatus >= 500) throw error;
      const tokenVencido = datos.code === 190 || (error instanceof Error && /session has been invalidated|error validating access token/i.test(error.message));
      const cuentaInexistente = datos.httpStatus === 404 || datos.code === 803;
      if (!tokenVencido && !cuentaInexistente) throw error;
    }
    return await desuscribirPaginaMeta(config, canalId);
  }
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
