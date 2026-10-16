import { createHmac, timingSafeEqual } from "node:crypto";

const NOMBRE_MEDIA = /^o\d+-\d+-[a-f0-9]{32}\.[a-z0-9]+$/;

function firmar(archivo: string, vence: string) {
  const clave = Buffer.from(process.env.META_TOKEN_ENCRYPTION_KEY ?? "", "base64");
  if (clave.length !== 32) throw new Error("falta la clave de cifrado para compartir adjuntos");
  return createHmac("sha256", clave).update(`media-messenger:${vence}:${archivo}`).digest("hex");
}

export function urlMediaPublica(urlLocal: string) {
  const archivo = urlLocal.replace(/^\/api\/media\//, "");
  if (!NOMBRE_MEDIA.test(archivo)) throw new Error("archivo inválido");
  const url = new URL(urlLocal, process.env.NEXTAUTH_URL);
  if (url.protocol !== "https:") throw new Error("configura NEXTAUTH_URL con https para los adjuntos de Messenger");
  const vence = String(Math.floor(Date.now() / 1000) + 900);
  url.searchParams.set("vence", vence);
  url.searchParams.set("firma", firmar(archivo, vence));
  return url.toString();
}

export function firmaMediaValida(archivo: string, vence: string | null, firma: string | null) {
  if (!NOMBRE_MEDIA.test(archivo) || !vence || !/^\d+$/.test(vence) || !firma) return false;
  const ahora = Math.floor(Date.now() / 1000);
  if (Number(vence) <= ahora || Number(vence) > ahora + 900) return false;
  try {
    const recibido = Buffer.from(firma);
    const esperado = Buffer.from(firmar(archivo, vence));
    return esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
  } catch { return false; }
}
