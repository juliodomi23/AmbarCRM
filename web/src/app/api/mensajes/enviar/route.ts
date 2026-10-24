import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProvider, destinatarioDelCanal, type TipoMensaje } from "@/lib/channel";
import { guardarMediaBase64 } from "@/lib/storage";
import { serializar } from "@/lib/serialize";
import { estadoVentana } from "@/lib/meta/ventana";
import { motivoDeError } from "@/lib/meta/errores";
import { referenciaAjena } from "@/lib/referencias";
import { conErrores } from "@/lib/errores-api";
import { urlMediaPublica } from "@/lib/channel/media-publica";

export const dynamic = "force-dynamic";

function tipoDesdeMime(mime: string): TipoMensaje {
  if (mime.startsWith("image/")) return "imagen";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "documento";
}

function normalizarMimeMedia(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const mime = valor.split(";")[0].trim().toLowerCase();
  if (!mime) return "application/octet-stream";
  return /^(image|video|audio|application|text)\/[a-z0-9][a-z0-9.+-]*$/.test(mime) ? mime : null;
}

function normalizarBase64Media(base64: string, mime: string): string {
  return base64.startsWith("data:") ? base64 : `data:${mime};base64,${base64}`;
}

/**
 * Envía un mensaje saliente (texto o media) por el canal de la conversación y lo registra.
 * Body texto: { conversacionId, texto }
 * Body media: { conversacionId, mediaBase64, mediaMime, caption? }
 */
async function manejarPOST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "no autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { conversacionId, texto, mediaBase64, mediaMime, caption, interna, audioBase64 } = body;
  const esMedia = typeof mediaBase64 === "string" && mediaBase64.length > 0;
  const esAudio = typeof audioBase64 === "string" && audioBase64.length > 0;
  // Plantilla aprobada: única forma de escribir fuera de la ventana de 24 h.
  const plantilla = typeof body.plantilla?.name === "string" && typeof body.plantilla?.language === "string"
    ? {
        name: body.plantilla.name as string,
        language: body.plantilla.language as string,
        variables: Array.isArray(body.plantilla.variables) ? body.plantilla.variables.map((v: unknown) => String(v ?? "")) : [],
        vistaPrevia: String(body.plantilla.vistaPrevia || `[Plantilla ${body.plantilla.name}]`).slice(0, 4096)
      }
    : null;

  // ~18 MB de archivo: arriba del límite de WhatsApp para imagen, audio y video (16 MB).
  const MAX_BASE64 = 24_000_000;
  if (String(mediaBase64 ?? "").length > MAX_BASE64 || String(audioBase64 ?? "").length > MAX_BASE64) {
    return NextResponse.json({ error: "el archivo es demasiado grande (máximo 16 MB)" }, { status: 413 });
  }
  const mimeMedia = esMedia ? normalizarMimeMedia(mediaMime) : null;
  if (esMedia && !mimeMedia) {
    return NextResponse.json(
      { error: "mediaMime es obligatorio y debe ser un tipo de imagen, video, audio o documento" },
      { status: 400 }
    );
  }
  if (!conversacionId || (!esMedia && !esAudio && !plantilla && !texto?.trim())) {
    return NextResponse.json({ error: "faltan campos" }, { status: 400 });
  }
  const ajena = await referenciaAjena({ conversacionId }, { conversacionId: "conversacion" });
  if (ajena) return NextResponse.json({ error: `${ajena} inexistente` }, { status: 404 });

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
  if (!conv.canal) {
    return NextResponse.json({ error: "la conversación no tiene canal" }, { status: 400 });
  }
  const destinatario = destinatarioDelCanal(conv.canal.proveedor, conv.contacto);
  if (!destinatario) return NextResponse.json({ error: "el contacto no tiene destinatario para este canal" }, { status: 400 });
  const provider = getProvider(conv.canal.proveedor, conv.canal.config, conv.canal.instancia);
  const contexto = { conversacionId: conv.id, ultimoEntranteAt: conv.ultimoEntranteAt, humano: true };

  if (!plantilla && conv.canal.proveedor === "cloud_api") {
    const ultimoEntrante = await db.mensaje.findFirst({
      where: { conversacionId: conv.id, direccion: "entrante" },
      orderBy: { timestamp: "desc" },
      select: { timestamp: true }
    });
    if (!estadoVentana(ultimoEntrante?.timestamp).abierta) {
      return NextResponse.json({ error: motivoDeError(131047), ventanaCerrada: true }, { status: 400 });
    }
  }

  let envio;
  let datosMensaje: { tipo: TipoMensaje; contenido: string | null; mediaUrl: string | null; mediaMime: string | null };

  if (plantilla) {
    if (!provider.enviarPlantilla) return NextResponse.json({ error: "el canal no admite plantillas" }, { status: 400 });
    envio = await provider.enviarPlantilla(
      destinatario,
      { name: plantilla.name, language: plantilla.language },
      plantilla.variables
    );
    datosMensaje = { tipo: "texto", contenido: plantilla.vistaPrevia, mediaUrl: null, mediaMime: null };
  } else if (esAudio) {
    // Cloud API recibe el audio mediante su endpoint de media; en local lo conservamos para reproducirlo.
    const mimeAudio = (mediaMime ?? "audio/ogg").split(";")[0];
    // Formatos de audio que acepta WhatsApp; webm (Chrome) llega ya convertido a ogg desde el navegador.
    if (!["audio/ogg", "audio/mp4", "audio/mpeg", "audio/aac", "audio/amr"].includes(mimeAudio)) {
      return NextResponse.json({ error: `WhatsApp no acepta audio en formato ${mimeAudio}` }, { status: 400 });
    }
    const limpio = audioBase64.includes(",") ? audioBase64.split(",")[1] : audioBase64;
    const publica = conv.canal.proveedor === "messenger" ? await guardarMediaBase64(audioBase64, mimeAudio) : null;
    const mediaEnvio = publica ? urlMediaPublica(publica) : audioBase64;
    envio = mimeAudio === "audio/ogg" && provider.enviarAudio
      ? await provider.enviarAudio(destinatario, limpio)
      : await provider.enviarMedia(destinatario, mediaEnvio, "audio", undefined, mimeAudio, contexto);
    const urlLocal = publica ?? await guardarMediaBase64(audioBase64, mimeAudio);
    datosMensaje = { tipo: "audio", contenido: null, mediaUrl: urlLocal, mediaMime: mimeAudio };
  } else if (esMedia) {
    const tipo = tipoDesdeMime(mimeMedia!);
    const publica = conv.canal.proveedor === "messenger" ? await guardarMediaBase64(mediaBase64, mimeMedia!) : null;
    const mediaEnvio = publica ? urlMediaPublica(publica) : normalizarBase64Media(mediaBase64, mimeMedia!);
    // A WhatsApp va el base64; en local guardamos el archivo para verlo en el hilo del CRM.
    envio = await provider.enviarMedia(destinatario, mediaEnvio, tipo, caption?.trim() || undefined, mimeMedia!, contexto);
    const urlLocal = publica ?? await guardarMediaBase64(mediaBase64, mimeMedia!);
    datosMensaje = { tipo, contenido: caption?.trim() || null, mediaUrl: urlLocal, mediaMime: mimeMedia! };
  } else {
    envio = await provider.enviarTexto(destinatario, texto, contexto);
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
      errorDetalle: envio.ok ? null : envio.error ?? null,
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

export const POST = conErrores(manejarPOST);
