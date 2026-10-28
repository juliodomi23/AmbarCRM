export const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION?.trim() || "v26.0";
export const META_GRAPH_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
export const INSTAGRAM_GRAPH_URL = `https://graph.instagram.com/${META_GRAPH_VERSION}`;

export function requireInstagramAppCredentials() {
  const appId = process.env.INSTAGRAM_APP_ID?.trim();
  const appSecret = process.env.INSTAGRAM_APP_SECRET?.trim();
  if (!appId || !appSecret) throw new Error("INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET sin configurar");
  return { appId, appSecret };
}

export function requireMetaAppCredentials() {
  const appId = process.env.META_APP_ID?.trim();
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appId || !appSecret) {
    throw new Error("META_APP_ID / META_APP_SECRET sin configurar");
  }
  return { appId, appSecret };
}
