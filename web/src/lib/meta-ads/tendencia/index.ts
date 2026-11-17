import { configuracionMetaAds } from "../oauth";

/**
 * Obtiene un access token válido para la app (client_credentials).
 * Este es el token que se usa para la API de Meta Ad Library, no el token ads_read del cliente.
 */
export async function tokenAppMetaAds() {
  const config = configuracionMetaAds();
  const url = new URL("https://graph.facebook.com/v26.0/oauth/access_token");
  url.searchParams.set("grant_type", "client_credentials");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("client_secret", config.clientSecret);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  if (!response.ok) {
    throw new Error("No se pudo obtener token de la app para Meta Ad Library");
  }

  const tokens = await response.json() as { access_token?: string; expires_in?: number; error?: { message?: string } };
  if (!tokens.access_token) {
    throw new Error("Meta respondió sin access_token");
  }

  return tokens.access_token;
}