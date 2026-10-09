import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { requireBot } from "@/lib/bot-auth";
import { leerMedia, mimeDeArchivo, orgDeArchivo } from "@/lib/storage";

export const dynamic = "force-dynamic";

const NO_ENCONTRADO = () => NextResponse.json({ error: "no encontrado" }, { status: 404 });

/** Sirve un archivo de media del chat. Acceso por sesión (el <img> manda la cookie) o por token de bot,
 *  y solo si el archivo es de la empresa de quien lo pide. */
export async function GET(req: NextRequest, props: { params: Promise<{ archivo: string }> }) {
  const { archivo } = await props.params;
  const bot = await requireBot(req);
  let orgId = bot?.orgId ?? null;
  if (!bot) {
    const s = await requireSesion();
    if ("error" in s) return s.error;
    orgId = s.orgId;
  }

  const dueno = orgDeArchivo(archivo);
  if (dueno !== null) {
    if (dueno !== orgId) return NO_ENCONTRADO();
  } else {
    // Archivo anterior al prefijo: debe pertenecer a un mensaje visible para esta empresa (RLS).
    const mensaje = await db.mensaje.findFirst({
      where: { mediaUrl: `/api/media/${archivo}` },
      select: { id: true },
    });
    if (!mensaje) return NO_ENCONTRADO();
  }

  const buf = await leerMedia(archivo);
  if (!buf) return NO_ENCONTRADO();

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": mimeDeArchivo(archivo),
      // Los archivos son inmutables (el nombre no se reutiliza): cache largo en el navegador.
      "Cache-Control": "private, max-age=2592000, immutable",
    },
  });
}
