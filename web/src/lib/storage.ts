// Almacenamiento simple de archivos en disco para el media saliente del chat.
// El archivo se guarda local (volumen Docker) y se sirve por /api/media/<archivo>
// Solo para mostrarlo dentro del CRM. Cloud API recibe el archivo mediante /media.

import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { orgActual } from "@/lib/db";
export { orgDeArchivo } from "@/lib/media-nombre";

const DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

// mime <-> extensión (lo común en WhatsApp). Lo demás cae a binario/octet-stream.
const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "audio/ogg": "ogg",
  "audio/webm": "weba",
  "audio/mpeg": "mp3",
  "application/pdf": "pdf"
};
const EXT_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_EXT).map(([m, e]) => [e, m])
);

export function extDeMime(mime: string): string {
  return MIME_EXT[mime] ?? "bin";
}

export function mimeDeArchivo(nombre: string): string {
  const ext = nombre.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? "application/octet-stream";
}

/** Guarda un base64 (con o sin prefijo data:) y devuelve la URL servible. */
export async function guardarMediaBase64(base64: string, mime: string): Promise<string> {
  await fs.mkdir(DIR, { recursive: true });
  const limpio = base64.includes(",") ? base64.split(",")[1] : base64;
  const buf = Buffer.from(limpio, "base64");
  // El prefijo o<empresa> permite comprobar al servirlo que el archivo es de quien lo pide.
  const org = await orgActual();
  const prefijo = org ? `o${org}-` : "";
  const nombre = `${prefijo}${Date.now()}-${crypto.randomBytes(16).toString("hex")}.${extDeMime(mime)}`;
  await fs.writeFile(path.join(DIR, nombre), buf);
  return `/api/media/${nombre}`;
}

/** Lee un archivo del directorio de uploads. `path.basename` evita path traversal. */
export async function leerMedia(nombre: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(path.join(/*turbopackIgnore: true*/ DIR, path.basename(nombre)));
  } catch {
    return null;
  }
}
