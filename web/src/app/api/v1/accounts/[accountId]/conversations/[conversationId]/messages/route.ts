import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getProvider, destinatarioDelCanal, responderTexto } from "@/lib/channel";
import { botAutorizado, conBot, denegarSinPermiso } from "@/lib/bot-auth";
import { auditarBot } from "@/lib/services/bots";
import { aBigInt } from "@/lib/ids";
import { serializarMensaje } from "@/lib/bot-conversations-read";
import { estadoVentana } from "@/lib/meta/ventana";
import { motivoDeError } from "@/lib/meta/errores";
import { destinoPublico } from "@/lib/webhook-url";
import type { TipoMensaje } from "@/lib/channel";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ accountId: string; conversationId: string }> }
) {
  const params = await props.params;
  return conBot(req, null, async (bot) => {
    if (!bot.permisos.includes("leer_perfil")) return NextResponse.json({ error: "permiso_faltante" }, { status: 403 });
    const convId = aBigInt(params.conversationId);
    if (convId === null) return NextResponse.json({ error: "conversationId inválido" }, { status: 400 });
    const conv = await db.conversacion.findFirst({
      where: { id: convId, orgId: bot.orgId, ...(bot.canalId === null ? {} : { canalId: bot.canalId }) },
      select: { id: true, contacto: { select: { id: true, nombre: true } } }
    });
    if (!conv) return NextResponse.json({ error: "conversación inexistente" }, { status: 404 });

    const query = req.nextUrl.searchParams;
    const beforeTexto = query.get("before");
    const afterTexto = query.get("after");
    if (beforeTexto !== null && afterTexto !== null) return NextResponse.json({ error: "before y after son excluyentes" }, { status: 400 });
    const cursorTexto = beforeTexto ?? afterTexto;
    const cursorId = cursorTexto === null ? null : aBigInt(cursorTexto);
    if (cursorTexto !== null && cursorId === null) return NextResponse.json({ error: "cursor inválido" }, { status: 400 });
    const privateParam = query.get("include_private");
    if (privateParam !== null && privateParam !== "true" && privateParam !== "false") {
      return NextResponse.json({ error: "include_private inválido" }, { status: 400 });
    }
    const includePrivate = privateParam === "true";
    if (includePrivate && !bot.permisos.includes("notas_internas")) {
      return NextResponse.json({ error: "permiso_faltante", permiso: "notas_internas" }, { status: 403 });
    }
    const limitTexto = query.get("limit");
    const limit = limitTexto === null ? 100 : Number(limitTexto);
    if (limitTexto !== null && (!/^[1-9]\d*$/.test(limitTexto) || !Number.isSafeInteger(limit) || limit > 500)) {
      return NextResponse.json({ error: "limit inválido" }, { status: 400 });
    }
    const cursor = cursorId === null ? null : await db.mensaje.findFirst({
      where: { id: cursorId, conversacionId: conv.id, ...(includePrivate ? {} : { interna: false }) },
      select: { id: true }
    });
    if (cursorId !== null && !cursor) return NextResponse.json({ error: "cursor inválido" }, { status: 400 });
    const retroceder = beforeTexto !== null;
    const mensajes = await db.mensaje.findMany({
      where: {
        conversacionId: conv.id,
        ...(includePrivate ? {} : { interna: false })
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
      take: retroceder ? -(limit + 1) : limit + 1,
      include: { usuario: { select: { id: true, nombre: true } } }
    });
    const hayMas = mensajes.length > limit;
    const pagina = retroceder ? mensajes.slice(-limit) : mensajes.slice(0, limit);
    const headers: Record<string, string> = {};
    if (hayMas && pagina.length) {
      if (retroceder) headers["X-Next-Before"] = String(pagina[0].id);
      else headers["X-Next-After"] = String(pagina.at(-1)!.id);
    }
    return NextResponse.json(pagina.map((m) => serializarMensaje(m, conv.contacto, bot)), { headers });
  });
}

/**
 * Endpoint de AmbarCRM para que los bots de n8n respondan.
 * POST /api/v1/accounts/:accountId/conversations/:conversationId/messages
 * Header: api_access_token = token del bot
 * Body:   { content, message_type?: "outgoing", private?: boolean }
 */
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ accountId: string; conversationId: string }> }
) {
  const params = await props.params;
  return conBot(req, null, async (bot) => {
    const convId = aBigInt(params.conversationId);
    if (convId === null) return NextResponse.json({ error: "conversationId inválido" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const content: string = (body.content ?? "").toString();
    const esPrivado = body.private === true;
    const sinPermiso = await denegarSinPermiso(bot, esPrivado ? "notas_internas" : "enviar_mensaje", convId, req);
    if (sinPermiso) return sinPermiso;
    const tieneAdjuntos = Object.hasOwn(body, "attachments");
    let adjunto: { tipo: TipoMensaje; url: string } | null = null;
    if (tieneAdjuntos) {
      if (!Array.isArray(body.attachments) || body.attachments.length !== 1) {
        return NextResponse.json({ error: "attachments requiere un adjunto" }, { status: 400 });
      }
      if (esPrivado) return NextResponse.json({ error: "nota privada no admite adjuntos" }, { status: 400 });
      const archivo = body.attachments[0];
      const tipos: Record<string, TipoMensaje> = { image: "imagen", audio: "audio", video: "video", file: "documento" };
      if (!archivo || typeof archivo !== "object" || typeof archivo.file_type !== "string" || !tipos[archivo.file_type]) {
        return NextResponse.json({ error: "file_type inválido" }, { status: 400 });
      }
      if (typeof archivo.data_url !== "string" || archivo.data_url.length > 2048 || !archivo.data_url.startsWith("https://") || !(await destinoPublico(archivo.data_url))) {
        return NextResponse.json({ error: "data_url debe ser una URL HTTPS pública" }, { status: 400 });
      }
      adjunto = { tipo: tipos[archivo.file_type], url: archivo.data_url };
    }
    if (!content.trim() && !adjunto) return NextResponse.json({ error: "content vacío" }, { status: 400 });

    const conv = await db.conversacion.findUnique({
      where: { id: convId },
      include: { contacto: true, canal: true }
    });
    if (!conv) return NextResponse.json({ error: "conversación inexistente" }, { status: 404 });
    if (!botAutorizado(bot, conv)) return NextResponse.json({ error: "el bot no opera en este canal" }, { status: 403 });

    // Nota privada: se guarda pero no se manda a WhatsApp.
    if (esPrivado) {
      const nota = await db.mensaje.create({
        data: { conversacionId: conv.id, direccion: "saliente", tipo: "texto", contenido: content, interna: true, status: "enviado" }
      });
      await auditarBot(bot, conv.id, "nota_interna", { entidad: "mensaje", entidadId: nota.id, despues: { contenido: content } });
      return NextResponse.json({ id: Number(nota.id), content, message_type: "outgoing", private: true });
    }

    if (!conv.canal) {
      return NextResponse.json({ error: "canal inexistente" }, { status: 400 });
    }
    if (!destinatarioDelCanal(conv.canal.proveedor, conv.contacto)) {
      return NextResponse.json({ error: "el contacto no tiene destinatario para este canal" }, { status: 422 });
    }
    const provider = getProvider(conv.canal.proveedor, conv.canal.config, conv.canal.instancia);
    let envio;
    if (adjunto) {
      if (conv.canal.proveedor === "cloud_api") {
        const ultimoEntrante = await db.mensaje.findFirst({
          where: { conversacionId: conv.id, direccion: "entrante" },
          orderBy: { timestamp: "desc" }, select: { timestamp: true }
        });
        if (!estadoVentana(ultimoEntrante?.timestamp).abierta) {
          return NextResponse.json({ error: motivoDeError(131047), ventanaCerrada: true }, { status: 400 });
        }
      }
      envio = await provider.enviarMedia(destinatarioDelCanal(conv.canal.proveedor, conv.contacto)!,
        adjunto.url, adjunto.tipo, content.trim() || undefined,
        undefined, { conversacionId: conv.id, ultimoEntranteAt: conv.ultimoEntranteAt, humano: false });
    } else {
      envio = await responderTexto(provider, conv.contacto, content, { conversacionId: conv.id, ultimoEntranteAt: conv.ultimoEntranteAt, humano: false });
    }

    const mensaje = await db.mensaje.create({
      data: {
        conversacionId: conv.id,
        direccion: "saliente",
        tipo: adjunto?.tipo ?? "texto",
        contenido: content,
        ...(adjunto ? { mediaUrl: adjunto.url } : {}),
        status: envio.ok ? "enviado" : "fallido",
        errorDetalle: envio.ok ? null : envio.error,
        waMessageId: envio.waMessageId
        // enviadoPor null => lo mandó el bot
      }
    });
    await db.conversacion.update({ where: { id: conv.id }, data: { ultimoMensajeAt: new Date() } });

    await auditarBot(bot, conv.id, "mensaje_enviado", {
      entidad: "mensaje",
      entidadId: mensaje.id,
      despues: { contenido: content, status: mensaje.status, ...(adjunto ? { tipo: adjunto.tipo, mediaUrl: adjunto.url } : {}) }
    });
    if (!envio.ok) return NextResponse.json({ error: envio.error ?? "fallo al enviar" }, { status: 502 });

    // Respuesta estable para los workflows de n8n.
    return NextResponse.json({
      id: Number(mensaje.id),
      content,
      message_type: "outgoing",
      conversation_id: Number(conv.id),
      created_at: mensaje.createdAt.toISOString()
    });
  });
}
