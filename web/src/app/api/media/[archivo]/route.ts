import { NextRequest, NextResponse } from "next/server";
import { requireSesion } from "@/lib/session";
import { requireBot } from "@/lib/bot-auth";
import { leerMedia, mimeDeArchivo } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Sirve un archivo de media del chat. Acceso por sesión (el <img> manda la cookie) o por token de bot. */
export async function GET(req: NextRequest, { params }: { params: { archivo: string } }) {
  const bot = await requireBot(req);
  if (!bot) {
    const s = await requireSesion();
    if ("error" in s) return s.error;
  }

  const buf = await leerMedia(params.archivo);
  if (!buf) return NextResponse.json({ error: "no encontrado" }, { status: 404 });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": mimeDeArchivo(params.archivo),
      // Los archivos son inmutables (el nombre no se reutiliza): cache largo en el navegador.
      "Cache-Control": "private, max-age=2592000, immutable"
    }
  });
}
