import { NextRequest, NextResponse } from "next/server";
import { conBot, conversacionDelBot } from "@/lib/bot-auth";
import { db } from "@/lib/db";
import { destinatarioDelCanal, getProvider } from "@/lib/channel";
import { auditarBot, notaDelBot } from "@/lib/services/bots";
import { conErrores } from "@/lib/errores-api";
import { destinoPublico } from "@/lib/webhook-url";
import { parsearParametrosPlantilla, validarParametrosPlantilla } from "@/lib/channel/template-components";

export const dynamic = "force-dynamic";

async function manejarPOST(
  req: NextRequest,
  props: { params: Promise<{ accountId: string; conversationId: string }> },
) {
  const { conversationId } = await props.params;
  return conBot(req, "enviar_mensaje", async (botAutenticado) => {
    const acceso = await conversacionDelBot(botAutenticado, conversationId);
    if (!acceso.conv) return acceso.respuesta;
    const { bot, conv } = acceso;
    if (!conv.canal || conv.canal.proveedor !== "cloud_api") {
      return NextResponse.json({ error: "las plantillas solo están disponibles en canales WhatsApp Cloud" }, { status: 409 });
    }
    const destinatario = destinatarioDelCanal(conv.canal.proveedor, conv.contacto);
    if (!destinatario) return NextResponse.json({ error: "el contacto no tiene teléfono" }, { status: 422 });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "datos de plantilla inválidos" }, { status: 400 });
    }
    const nombre = typeof body.name === "string" ? body.name.trim() : "";
    const idioma = typeof body.language === "string" ? body.language.trim() : "";
    const variables = body.variables ?? [];
    if (!nombre || nombre.length > 512 || !idioma || idioma.length > 35) {
      return NextResponse.json({ error: "name e language son obligatorios" }, { status: 400 });
    }
    if (!Array.isArray(variables) || variables.length > 50 || !variables.every((valor) => typeof valor === "string" && valor.length <= 2000)) {
      return NextResponse.json({ error: "variables debe ser una lista de hasta 50 textos" }, { status: 400 });
    }
    const parametros = parsearParametrosPlantilla(body.header, body.buttons);
    if (!parametros.ok) {
      return NextResponse.json({ error: parametros.error.mensaje, motivo: parametros.error.motivo }, { status: 400 });
    }
    const encabezado = parametros.parametros.encabezado;
    if (encabezado && encabezado.type !== "text" && !(await destinoPublico(encabezado.link))) {
      return NextResponse.json({ error: "header.link debe ser una URL HTTPS pública", motivo: "url_encabezado_invalida" }, { status: 400 });
    }

    const provider = getProvider(conv.canal.proveedor, conv.canal.config, conv.canal.instancia);
    if (!provider.consultarPlantillas || !provider.enviarPlantilla) {
      return NextResponse.json({ error: "el canal no admite plantillas" }, { status: 409 });
    }
    const consulta = await provider.consultarPlantillas();
    if (!consulta.ok) {
      if (consulta.motivo === "sin_waba") {
        return NextResponse.json({ error: "el canal no tiene WABA configurada", motivo: "canal_sin_waba" }, { status: 409 });
      }
      if (consulta.motivo === "no_disponible") {
        return NextResponse.json({ error: "WhatsApp no respondió al consultar las plantillas", motivo: "meta_no_disponible" }, { status: 503 });
      }
      return NextResponse.json({ error: "WhatsApp rechazó la consulta de plantillas", motivo: "meta_rechazo" }, { status: 502 });
    }
    const plantilla = consulta.plantillas.find((item) => item.name === nombre && item.language === idioma && item.status === "APPROVED");
    if (!plantilla) {
      return NextResponse.json({ error: "la plantilla no está aprobada para ese idioma", motivo: "plantilla_no_aprobada" }, { status: 409 });
    }

    const errorParametros = validarParametrosPlantilla(plantilla, variables, parametros.parametros);
    if (errorParametros) {
      return NextResponse.json({ error: errorParametros.mensaje, motivo: errorParametros.motivo }, { status: 400 });
    }

    const resultado = await provider.enviarPlantilla(destinatario, plantilla, variables, parametros.parametros);
    const contenido = `[Plantilla ${plantilla.name} · ${plantilla.language}]`;
    const mensaje = await db.mensaje.create({
      data: {
        conversacionId: conv.id,
        direccion: "saliente",
        tipo: "plantilla",
        contenido,
        status: resultado.ok ? "enviado" : "fallido",
        errorDetalle: resultado.ok ? null : (resultado.error ?? "No se pudo enviar"),
        waMessageId: resultado.waMessageId,
      },
    });
    await db.conversacion.update({ where: { id: conv.id }, data: { ultimoMensajeAt: new Date() } });
    await auditarBot(bot, conv.id, "mensaje_enviado", {
      entidad: "mensaje",
      entidadId: mensaje.id,
      despues: { tipo: "plantilla", name: plantilla.name, language: plantilla.language, status: mensaje.status },
    });
    await notaDelBot(conv.id, `Envió plantilla ${plantilla.name} (${plantilla.language})`);
    if (!resultado.ok) {
      return NextResponse.json({ error: "WhatsApp no pudo enviar la plantilla", motivo: "meta_rechazo" }, { status: 502 });
    }
    return NextResponse.json({
      id: Number(mensaje.id),
      template_name: plantilla.name,
      language: plantilla.language,
      status: "enviado",
      conversation_id: Number(conv.id),
    });
  });
}

export const POST = conErrores(manejarPOST);
