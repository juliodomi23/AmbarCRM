import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { transaccionTenant } from "@/lib/retail-db";
import { cifrarCredencialPago, descifrarCredencialPago } from "@/lib/pagos/credenciales";

export const COOKIE_OAUTH_PAGOS = "ambar_pagos_oauth";
const DURACION_STATE_MS = 10 * 60_000;
const SEGUNDOS_180_DIAS = 180 * 24 * 60 * 60;

type PayloadState = {
  orgId: string;
  userId: string;
  nonce: string;
  exp: number;
};

export type TokensMercadoPago = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  user_id?: number | string;
  scope?: string;
  public_key?: string;
  live_mode?: boolean;
};

function configuracionOAuth() {
  const clientId = process.env.MERCADOPAGO_CLIENT_ID?.trim();
  const clientSecret = process.env.MERCADOPAGO_CLIENT_SECRET?.trim();
  const redirectUri = process.env.MERCADOPAGO_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri)
    throw new Error("OAuth de Mercado Pago no está configurado");
  return { clientId, clientSecret, redirectUri };
}

function firma(valor: string) {
  return createHmac("sha256", configuracionOAuth().clientSecret)
    .update(valor)
    .digest("base64url");
}

export function crearStateOAuth(orgId: bigint, userId: bigint) {
  const payload: PayloadState = {
    orgId: String(orgId),
    userId: String(userId),
    nonce: randomBytes(24).toString("base64url"),
    exp: Date.now() + DURACION_STATE_MS,
  };
  const codificado = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { state: `${codificado}.${firma(codificado)}`, nonce: payload.nonce };
}

export function validarStateOAuth(
  state: string,
  nonceCookie: string,
  orgId: bigint,
  userId: bigint,
  ahora = Date.now(),
) {
  const [codificado, recibida, extra] = state.split(".");
  if (!codificado || !recibida || extra) return false;
  const esperada = firma(codificado);
  const a = Buffer.from(recibida);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const payload = JSON.parse(
      Buffer.from(codificado, "base64url").toString("utf8"),
    ) as PayloadState;
    return (
      payload.nonce === nonceCookie &&
      payload.orgId === String(orgId) &&
      payload.userId === String(userId) &&
      payload.exp >= ahora
    );
  } catch {
    return false;
  }
}

export function urlAutorizacionMercadoPago(state: string) {
  const { clientId, redirectUri } = configuracionOAuth();
  const url = new URL("https://auth.mercadopago.com/authorization");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "offline_access");
  url.searchParams.set("state", state);
  return url;
}

async function solicitarTokens(
  datos:
    | { grant_type: "authorization_code"; code: string; redirect_uri: string }
    | { grant_type: "refresh_token"; refresh_token: string },
) {
  const { clientId, clientSecret } = configuracionOAuth();
  const respuesta = await fetch("https://api.mercadopago.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      ...datos,
    }),
  });
  const cuerpo = (await respuesta.json().catch(() => ({}))) as Partial<TokensMercadoPago>;
  if (!respuesta.ok || !cuerpo.access_token)
    throw new Error("Mercado Pago rechazó la autorización");
  return cuerpo as TokensMercadoPago;
}

export function intercambiarCodigoOAuth(code: string) {
  return solicitarTokens({
    grant_type: "authorization_code",
    code,
    redirect_uri: configuracionOAuth().redirectUri,
  });
}

export function refrescarTokensOAuth(refreshToken: string) {
  return solicitarTokens({ grant_type: "refresh_token", refresh_token: refreshToken });
}

function datosTokens(tokens: TokensMercadoPago) {
  return {
    accessTokenEncrypted: cifrarCredencialPago(tokens.access_token),
    refreshTokenEncrypted: tokens.refresh_token
      ? cifrarCredencialPago(tokens.refresh_token)
      : undefined,
    expiresAt: new Date(
      Date.now() + (tokens.expires_in ?? SEGUNDOS_180_DIAS) * 1000,
    ),
    proveedorUserId:
      tokens.user_id === undefined ? undefined : String(tokens.user_id),
    scope: tokens.scope,
    publicKey: tokens.public_key,
    sandbox: tokens.live_mode === false,
    activo: true,
    requiereReconexion: false,
  } satisfies Prisma.CredencialPagoUncheckedUpdateInput;
}

export async function guardarTokensOAuth(orgId: bigint, tokens: TokensMercadoPago) {
  await transaccionTenant(orgId, async (tx) => {
    await tx.credencialPago.updateMany({ data: { activo: false } });
    await tx.credencialPago.upsert({
      where: { orgId_proveedor: { orgId, proveedor: "mercado_pago" } },
      create: {
        proveedor: "mercado_pago",
        ...datosTokens(tokens),
      },
      update: datosTokens(tokens),
    });
  });
}

export async function renovarCredencialMercadoPago(
  orgId: bigint,
  credencial: {
    id: bigint;
    refreshTokenEncrypted: string | null;
  },
) {
  if (!credencial.refreshTokenEncrypted)
    throw new Error("La conexión de Mercado Pago requiere autorización nuevamente");
  try {
    const tokens = await refrescarTokensOAuth(
      descifrarCredencialPago(credencial.refreshTokenEncrypted),
    );
    await guardarTokensOAuth(orgId, tokens);
    return db.credencialPago.findFirstOrThrow({
      where: { proveedor: "mercado_pago", activo: true },
    });
  } catch (error) {
    await db.credencialPago.update({
      where: { id: credencial.id },
      data: { requiereReconexion: true },
    });
    throw error;
  }
}
