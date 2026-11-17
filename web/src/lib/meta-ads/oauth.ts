import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cifrarCredencialPago, descifrarCredencialPago } from "@/lib/pagos/credenciales";
import { db } from "@/lib/db";
import { transaccionTenant } from "@/lib/retail-db";

export const COOKIE_OAUTH_META_ADS = "ambar_meta_ads_oauth";
const DURACION_STATE_MS = 10 * 60_000;

type State = { orgId: string; userId: string; nonce: string; exp: number };

function secretoFirma() {
  const secreto = process.env.META_APP_SECRET?.trim();
  if (!secreto) throw new Error("Falta META_APP_SECRET");
  return secreto;
}

export function configuracionMetaAds() {
  const clientId = process.env.META_APP_ID?.trim();
  const clientSecret = process.env.META_APP_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error("Faltan META_APP_ID o META_APP_SECRET");
  const redirectUri = process.env.META_ADS_OAUTH_REDIRECT_BASE?.trim()
    || `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/meta-ads/oauth/callback`;
  return { clientId, clientSecret, redirectUri };
}

export function crearStateMetaAds(orgId: bigint, userId: bigint) {
  const payload: State = { orgId: String(orgId), userId: String(userId), nonce: randomBytes(24).toString("base64url"), exp: Date.now() + DURACION_STATE_MS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secretoFirma()).update(encoded).digest("base64url");
  return { state: `${encoded}.${signature}`, cookie: Buffer.from(JSON.stringify({ nonce: payload.nonce })).toString("base64url") };
}

export function validarStateMetaAds(state: string, nonce: string, orgId: bigint, userId: bigint, now = Date.now()) {
  try {
    const [encoded, signature, extra] = state.split(".");
    if (!encoded || !signature || extra) return false;
    const expected = createHmac("sha256", secretoFirma()).update(encoded).digest("base64url");
    const a = Buffer.from(signature); const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString()) as State;
    return payload.nonce === nonce && payload.orgId === String(orgId) && payload.userId === String(userId) && payload.exp >= now;
  } catch { return false; }
}

export function leerNonceMetaAds(value: string) {
  try { const parsed = JSON.parse(Buffer.from(value, "base64url").toString()) as { nonce?: unknown }; return typeof parsed.nonce === "string" ? parsed.nonce : null; } catch { return null; }
}

export function urlAutorizacionMetaAds(state: string) {
  const config = configuracionMetaAds();
  const url = new URL("https://www.facebook.com/v26.0/dialog/oauth");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "ads_read");
  url.searchParams.set("auth_type", "rerequest");
  url.searchParams.set("state", state);
  return url;
}

export async function intercambiarCodigoMetaAds(code: string) {
  const config = configuracionMetaAds();
  const response = await fetch("https://graph.facebook.com/v26.0/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri }),
  });
  const tokens = await response.json().catch(() => ({})) as { access_token?: string; token_type?: string; expires_in?: number; error?: { message?: string } };
  if (!response.ok || !tokens.access_token) throw new Error("Meta rechazó la autorización de Ads");
  return { access_token: tokens.access_token, expires_in: tokens.expires_in ?? 3600 };
}

export async function intercambiarPorTokenLargoVida(shortToken: string) {
  const config = configuracionMetaAds();
  const response = await fetch("https://graph.facebook.com/v26.0/oauth/access_token", {
    method: "GET",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  const url = new URL("https://graph.facebook.com/v26.0/oauth/access_token");
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("client_secret", config.clientSecret);
  url.searchParams.set("fb_exchange_token", shortToken);
  const resp = await fetch(url);
  const tokens = await resp.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error?: { message?: string } };
  if (!resp.ok || !tokens.access_token) throw new Error("No se pudo obtener token de larga duración de Meta");
  return { access_token: tokens.access_token, expires_in: tokens.expires_in ?? 5184000 };
}

export async function listarCuentasPublicitarias(token: string) {
  const response = await fetch("https://graph.facebook.com/v26.0/me/adaccounts?fields=id,account_id,name,account_status&limit=100", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("No se pudieron consultar las cuentas publicitarias");
  const data = await response.json() as { data?: Array<{ id: string; account_id: string; name: string; account_status: number }> };
  // item.id de Meta ya trae el prefijo "act_". Almacenamos account_id sin prefijo en adAccountId;
  // quien construye la URL del endpoint de insights lo antepone (ver sincronizarInsightsOrg).
  return (data.data ?? []).map((item) => ({ id: item.account_id, nombre: item.name, estado: item.account_status }));
}

export async function guardarConexionMetaAds(orgId: bigint, userId: bigint, adAccountId: string, accessToken: string, refreshToken: string | null, tokenExpiraAt: Date) {
  await transaccionTenant(orgId, async (tx) => {
    await tx.metaAdsConexion.upsert({
      where: { orgId },
      create: {
        adAccountId,
        accessTokenEncrypted: cifrarCredencialPago(accessToken),
        refreshTokenEncrypted: refreshToken ? cifrarCredencialPago(refreshToken) : null,
        tokenExpiraAt,
        estado: "activa",
      },
      update: {
        adAccountId,
        accessTokenEncrypted: cifrarCredencialPago(accessToken),
        ...(refreshToken ? { refreshTokenEncrypted: cifrarCredencialPago(refreshToken) } : {}),
        tokenExpiraAt,
        estado: "activa",
        ultimoError: null,
      },
    });
  });
}

export async function revocarTokenMetaAds(accessTokenEncrypted: string) {
  try {
    const token = descifrarCredencialPago(accessTokenEncrypted);
    await fetch(`https://graph.facebook.com/v26.0/me/permissions`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  } catch { /* la desconexión local debe completarse aunque Meta no responda */ }
}

/**
 * Obtiene un access token válido para la conexión.
 * - Si expira en > 60s, devuelve el token descifrado.
 * - Si expira pronto, intenta renovar con fb_exchange_token.
 * - Si falla, marca la conexión como "requiere_reconectar".
 */
export async function tokenMetaAds(orgId: bigint, conexion: { id: bigint; adAccountId: string; accessTokenEncrypted: string; refreshTokenEncrypted: string | null; tokenExpiraAt: Date | null }) {
  if (!conexion.tokenExpiraAt || conexion.tokenExpiraAt.getTime() > Date.now() + 60_000) return descifrarCredencialPago(conexion.accessTokenEncrypted);
  if (!conexion.refreshTokenEncrypted) throw new Error("La conexión de Meta requiere autorización nuevamente");
  try {
    const currentToken = descifrarCredencialPago(conexion.accessTokenEncrypted);
    const { access_token, expires_in } = await intercambiarPorTokenLargoVida(currentToken);
    await transaccionTenant(orgId, (tx) => tx.metaAdsConexion.update({
      where: { id: conexion.id },
      data: { accessTokenEncrypted: cifrarCredencialPago(access_token), tokenExpiraAt: new Date(Date.now() + expires_in * 1000), estado: "activa", ultimoError: null },
    }));
    return access_token;
  } catch (error) {
    await transaccionTenant(orgId, (tx) => tx.metaAdsConexion.update({
      where: { id: conexion.id },
      data: { estado: "requiere_reconectar", ultimoError: "No fue posible renovar la conexión con Meta Ads" },
    }));
    throw error;
  }
}