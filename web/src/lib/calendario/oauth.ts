import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cifrarCredencialPago, descifrarCredencialPago } from "@/lib/pagos/credenciales";
import { db } from "@/lib/db";
import { transaccionTenant } from "@/lib/retail-db";

export const COOKIE_OAUTH_CALENDARIO = "ambar_calendario_oauth";
const DURACION_STATE_MS = 10 * 60_000;
type State = { orgId: string; userId: string; nonce: string; exp: number };

function secretoFirma() {
  const secreto = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
  if (!secreto) throw new Error("Falta GOOGLE_CALENDAR_CLIENT_SECRET");
  return secreto;
}
export function configuracionCalendario() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error("Faltan GOOGLE_CALENDAR_CLIENT_ID o GOOGLE_CALENDAR_CLIENT_SECRET");
  const redirectUri = process.env.CALENDARIO_OAUTH_REDIRECT_BASE?.trim() || `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/calendario/oauth/callback`;
  return { clientId, clientSecret, redirectUri };
}
export function crearStateCalendario(orgId: bigint, userId: bigint) {
  const payload: State = { orgId: String(orgId), userId: String(userId), nonce: randomBytes(24).toString("base64url"), exp: Date.now() + DURACION_STATE_MS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secretoFirma()).update(encoded).digest("base64url");
  return { state: `${encoded}.${signature}`, cookie: Buffer.from(JSON.stringify({ nonce: payload.nonce })).toString("base64url") };
}
export function validarStateCalendario(state: string, nonce: string, orgId: bigint, userId: bigint, now = Date.now()) {
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
export function leerNonceCalendario(value: string) {
  try { const parsed = JSON.parse(Buffer.from(value, "base64url").toString()) as { nonce?: unknown }; return typeof parsed.nonce === "string" ? parsed.nonce : null; } catch { return null; }
}
export function urlAutorizacionCalendario(state: string) {
  const config = configuracionCalendario();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.clientId); url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code"); url.searchParams.set("scope", "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly email");
  url.searchParams.set("access_type", "offline"); url.searchParams.set("prompt", "consent"); url.searchParams.set("include_granted_scopes", "true"); url.searchParams.set("state", state);
  return url;
}
export async function intercambiarCodigoCalendario(code: string) {
  const config = configuracionCalendario();
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: "authorization_code" }) });
  const tokens = await response.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
  if (!response.ok || !tokens.access_token) throw new Error("Google rechazó la autorización de Calendar");
  const userInfo = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  const user = await userInfo.json().catch(() => ({})) as { email?: string };
  if (!userInfo.ok || !user.email) throw new Error("No se pudo verificar la cuenta de Google");
  return { ...tokens, email: user.email };
}
export async function guardarConexionCalendario(orgId: bigint, userId: bigint, tokens: Awaited<ReturnType<typeof intercambiarCodigoCalendario>>, timezone: string) {
  await transaccionTenant(orgId, async (tx) => {
    await tx.calendarioConectado.upsert({ where: { orgId_usuarioCrmId: { orgId, usuarioCrmId: userId } }, create: {
      usuarioCrmId: userId, proveedor: "google", cuentaGoogle: tokens.email, calendarId: "primary", accessTokenEncrypted: cifrarCredencialPago(tokens.access_token!),
      refreshTokenEncrypted: tokens.refresh_token ? cifrarCredencialPago(tokens.refresh_token) : null,
      tokenExpiraAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000), timezone,
    }, update: { proveedor: "google", cuentaGoogle: tokens.email, accessTokenEncrypted: cifrarCredencialPago(tokens.access_token!),
      ...(tokens.refresh_token ? { refreshTokenEncrypted: cifrarCredencialPago(tokens.refresh_token) } : {}),
      tokenExpiraAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000), timezone, estado: "activa", ultimoError: null,
    } });
  });
}
export async function listarCalendariosGoogle(token: string) {
  const response = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250", { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error("No se pudieron consultar los calendarios de Google");
  const data = await response.json() as { items?: Array<{ id: string; summary: string; primary?: boolean; accessRole?: string; timeZone?: string }> };
  return (data.items ?? []).filter((item) => item.accessRole === "owner" || item.accessRole === "writer").map((item) => ({ id: item.id, nombre: item.summary, primary: Boolean(item.primary), timezone: item.timeZone ?? null }));
}
export async function revocarTokenCalendario(accessTokenEncrypted: string) {
  try {
    const token = descifrarCredencialPago(accessTokenEncrypted);
    await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) });
  } catch { /* la desconexión local debe completarse aunque Google no responda */ }
}
export async function tokenCalendario(orgId: bigint, conexion: { id: bigint; accessTokenEncrypted: string; refreshTokenEncrypted: string | null; tokenExpiraAt: Date | null }) {
  if (!conexion.tokenExpiraAt || conexion.tokenExpiraAt.getTime() > Date.now() + 60_000) return descifrarCredencialPago(conexion.accessTokenEncrypted);
  if (!conexion.refreshTokenEncrypted) throw new Error("La conexión de Google requiere autorización nuevamente");
  try {
    const config = configuracionCalendario();
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: descifrarCredencialPago(conexion.refreshTokenEncrypted), grant_type: "refresh_token" }) });
    const tokens = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number };
    if (!response.ok || !tokens.access_token) throw new Error("Google rechazó la renovación de credenciales");
    await db.calendarioConectado.update({ where: { id: conexion.id }, data: { accessTokenEncrypted: cifrarCredencialPago(tokens.access_token), tokenExpiraAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000), estado: "activa", ultimoError: null } });
    return tokens.access_token;
  } catch (error) {
    await db.calendarioConectado.update({ where: { id: conexion.id }, data: { estado: "requiere_reconectar", ultimoError: "No fue posible renovar la conexión con Google" } });
    throw error;
  }
}
