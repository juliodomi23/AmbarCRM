import { INSTAGRAM_GRAPH_URL, requireInstagramAppCredentials } from "./config";

export const INSTAGRAM_OAUTH_CALLBACK = "/api/canales/instagram/oauth/callback";

export function urlInstagramLogin(origen: string, state: string) {
  const { appId } = requireInstagramAppCredentials();
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", `${origen}${INSTAGRAM_OAUTH_CALLBACK}`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "instagram_business_basic,instagram_business_manage_messages");
  url.searchParams.set("state", state);
  return url.toString();
}

async function respuestaInstagram(endpoint: string, url: string, init?: RequestInit) {
  let res: Response;
  try { res = await fetch(url, { ...init, signal: AbortSignal.timeout(8000) }); }
  catch {
    console.error("[instagram-login]", { endpoint, http: null, mensaje: "Fallo de red" });
    throw new Error(`No se pudo consultar Instagram (${endpoint}).`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const error = data.error ?? {};
    const mensaje = typeof error.message === "string" ? error.message.replace(/[A-Za-z0-9_-]{40,}/g, "[oculto]") : undefined;
    console.error("[instagram-login]", { endpoint, http: res.status, code: error.code, subcode: error.error_subcode, mensaje });
    throw new Error(`Instagram rechazó la conexión (${endpoint}, HTTP ${res.status}).`);
  }
  return data;
}

export async function cuentaInstagramLogin(code: string, origen: string) {
  const { appId, appSecret } = requireInstagramAppCredentials();
  const corto = await respuestaInstagram("/oauth/access_token", "https://api.instagram.com/oauth/access_token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: appId, client_secret: appSecret, grant_type: "authorization_code",
      redirect_uri: `${origen}${INSTAGRAM_OAUTH_CALLBACK}`, code }),
  });
  if (typeof corto.access_token !== "string") {
    console.error("[instagram-login]", { endpoint: "/oauth/access_token", http: 200, mensaje: "Falta access_token" });
    throw new Error("Instagram no devolvió un token de acceso.");
  }
  const intercambio = new URL("https://graph.instagram.com/access_token");
  intercambio.searchParams.set("grant_type", "ig_exchange_token");
  intercambio.searchParams.set("client_secret", appSecret);
  intercambio.searchParams.set("access_token", corto.access_token);
  const largo = await respuestaInstagram("/access_token", intercambio.toString());
  if (typeof largo.access_token !== "string" || !Number.isFinite(Number(largo.expires_in))) {
    console.error("[instagram-login]", { endpoint: "/access_token", http: 200, mensaje: "Falta token o vencimiento" });
    throw new Error("Instagram no devolvió un token de larga duración.");
  }
  const perfil = await respuestaInstagram("/me", `${INSTAGRAM_GRAPH_URL}/me?fields=user_id,username,name,profile_picture_url,account_type`, {
    headers: { Authorization: `Bearer ${largo.access_token}` },
  });
  if (!/^(BUSINESS|CREATOR)$/i.test(String(perfil.account_type ?? ""))) {
    console.error("[instagram-login]", { endpoint: "/me", http: 200, mensaje: "Cuenta no profesional" });
    throw new Error("La cuenta debe ser profesional (Empresa o Creador).");
  }
  if (!/^\d{1,40}$/.test(String(perfil.user_id ?? "")) || !perfil.username) {
    console.error("[instagram-login]", { endpoint: "/me", http: 200, mensaje: "Falta user_id o username" });
    throw new Error("Instagram no devolvió una cuenta válida.");
  }
  return { instagramId: String(perfil.user_id), username: String(perfil.username), token: largo.access_token,
    tokenExpiraAt: new Date(Date.now() + Number(largo.expires_in) * 1000).toISOString() };
}

export async function suscribirInstagramLogin(token: string) {
  const data = await respuestaInstagram("/me/subscribed_apps", `${INSTAGRAM_GRAPH_URL}/me/subscribed_apps`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ subscribed_fields: ["messages"] }),
  });
  if (data.success !== true) {
    console.error("[instagram-login]", { endpoint: "/me/subscribed_apps", http: 200, mensaje: "Falta success: true" });
    throw new Error("Instagram no confirmó la suscripción de mensajes.");
  }
}
