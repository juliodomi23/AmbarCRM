import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProvider, type TipoMensaje } from "@/lib/channel";
import { guardarMediaBase64 } from "@/lib/storage";
import { serializar } from "@/lib/serialize";

export const dynamic = "force-dynamic";

function tipoDesdeMime(mime: string): TipoMensaje {
  if (mime.startsWith("image/")) return "imagen";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "documento";
}

/**
 * Envía un mensaje saliente (texto o media) por el canal de la conversación y lo registra.
 * Body texto: { conversacionId, texto }
 * Body media: { conversacionId, mediaBase64, mediaMime, caption? }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "no autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { conversacionId, texto, mediaBase64, mediaMime, caption, interna, audioBase64 } = body;
  const esMedia = !!mediaBase64;
  const esAudio = !!audioBase64;

  if (!conversacionId || (!esMedia && !esAudio && !texto?.trim())) {
    return NextResponse.json({ error: "faltan campos" }, { status: 400 });
  }

  // Nota interna: se guarda en el hilo pero NO se manda a WhatsApp.
  if (interna === true && texto?.trim()) {
    const nota = await db.mensaje.create({
      data: {
        conversacionId: BigInt(conversacionId),
        direccion: "saliente",
        tipo: "texto",
        contenido: texto,
        interna: true,
        status: "enviado",
        enviadoPor: session.user.id ? BigInt(session.user.id) : null
      }
    });
    return NextResponse.json({ ok: true, mensaje: serializar(nota) });
  }

  const conv = await db.conversacion.findUnique({
    where: { id: BigInt(conversacionId) },
    include: { contacto: true, canal: true }
  });
  if (!conv) return NextResponse.json({ error: "conversación inexistente" }, { status: 404 });
  if (!conv.contacto.telefono) {
    return NextResponse.json({ error: "el contacto no tiene teléfono" }, { status: 400 });
  }

  const provider = getProvider(conv.canal?.proveedor ?? "evolution", conv.canal?.config, conv.canal?.instancia);

  let envio;
  let datosMensaje: { tipo: TipoMensaje; contenido: string | null; mediaUrl: string | null; mediaMime: string | null };

  if (esAudio) {
    // Nota de voz: a Evolution va el base64 limpio; en local guardamos el archivo para reproducirlo.
    const limpio = audioBase64.includes(",") ? audioBase64.split(",")[1] : audioBase64;
    envio = provider.enviarAudio
      ? await provider.enviarAudio(conv.contacto.telefono, limpio)
      : await provider.enviarMedia(conv.contacto.telefono, audioBase64, "audio");
    const urlLocal = await guardarMediaBase64(audioBase64, mediaMime ?? "audio/ogg");
    datosMensaje = { tipo: "audio", contenido: null, mediaUrl: urlLocal, mediaMime: mediaMime ?? "audio/ogg" };
  } else if (esMedia) {
    const tipo = tipoDesdeMime(mediaMime ?? "");
    // A WhatsApp va el base64; en local guardamos el archivo para verlo en el hilo del CRM.
    envio = await provider.enviarMedia(conv.contacto.telefono, mediaBase64, tipo, caption?.trim() || undefined, mediaMime);
    const urlLocal = await guardarMediaBase64(mediaBase64, mediaMime ?? "application/octet-stream");
    datosMensaje = { tipo, contenido: caption?.trim() || null, mediaUrl: urlLocal, mediaMime: mediaMime ?? null };
  } else {
    envio = await provider.enviarTexto(conv.contacto.telefono, texto);
    datosMensaje = { tipo: "texto", contenido: texto, mediaUrl: null, mediaMime: null };
  }

  const mensaje = await db.mensaje.create({
    data: {
      conversacionId: conv.id,
      direccion: "saliente",
      tipo: datosMensaje.tipo,
      contenido: datosMensaje.contenido,
      mediaUrl: datosMensaje.mediaUrl,
      mediaMime: datosMensaje.mediaMime,
      status: envio.ok ? "enviado" : "fallido",
      waMessageId: envio.waMessageId,
      enviadoPor: session.user.id ? BigInt(session.user.id) : null
    }
  });

  await db.conversacion.update({
    where: { id: conv.id },
    data: { ultimoMensajeAt: new Date() }
  });

  if (!envio.ok) {
    return NextResponse.json({ ok: false, error: envio.error, mensaje: serializar(mensaje) }, { status: 502 });
  }
  return NextResponse.json({ ok: true, mensaje: serializar(mensaje) });
}
