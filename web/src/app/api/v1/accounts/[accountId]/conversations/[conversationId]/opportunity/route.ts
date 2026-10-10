import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { conBot, conversacionDelBot } from "@/lib/bot-auth";
import { db } from "@/lib/db";
import { dinero } from "@/lib/dinero";
import { conErrores } from "@/lib/errores-api";
import { aBigInt } from "@/lib/ids";
import { moverLeadAEtapa, oportunidadAbierta } from "@/lib/services/funnel";
import { auditarBot } from "@/lib/services/bots";

export const dynamic = "force-dynamic";

/**
 * Edita la oportunidad abierta más reciente del contacto: valor, responsable y/o embudo y etapa.
 * PATCH …/opportunity  Body: { valor?, responsableId? (null = sin responsable), embudo?, etapa? }
 * Con `embudo` sin `etapa` pasa a la primera etapa de ese embudo. Cada cambio queda como evento de la
 * oportunidad y en la bitácora. No crea oportunidades (usa funnel para eso).
 */
async function manejarPATCH(req: NextRequest, props: { params: Promise<{ accountId: string; conversationId: string }> }) {
  const { conversationId } = await props.params;
  return conBot(req, "editar_oportunidad", async (botAutenticado) => {
    const acceso = await conversacionDelBot(botAutenticado, conversationId);
    if (!acceso.conv) return acceso.respuesta;
    const { bot, conv } = acceso;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const quiereValor = body.valor !== undefined;
    const quiereResponsable = body.responsableId !== undefined;
    const embudo = body.embudo === undefined ? undefined : String(body.embudo).trim();
    const etapa = body.etapa === undefined ? undefined : String(body.etapa).trim();
    if (!quiereValor && !quiereResponsable && !embudo && !etapa) {
      return NextResponse.json({ error: "indica valor, responsableId, embudo o etapa" }, { status: 400 });
    }
    if (embudo === "" || etapa === "") return NextResponse.json({ error: "embudo y etapa no pueden ir vacíos" }, { status: 400 });

    let valor: Prisma.Decimal | undefined;
    if (quiereValor) {
      const numero = dinero(body.valor);
      if (numero === null) return NextResponse.json({ error: "valor inválido (número positivo, máx. 2 decimales)" }, { status: 400 });
      valor = new Prisma.Decimal(numero.toFixed(2));
    }
    let responsableId: bigint | null | undefined;
    if (quiereResponsable) {
      if (body.responsableId === null) responsableId = null;
      else {
        const id = aBigInt(String(body.responsableId));
        // RLS limita la búsqueda a usuarios de la empresa del bot.
        const usuario = id === null ? null : await db.usuario.findFirst({ where: { id, activo: true }, select: { id: true } });
        if (!usuario) return NextResponse.json({ error: "responsable inexistente o inactivo" }, { status: 400 });
        responsableId = usuario.id;
      }
    }

    const antes = await oportunidadAbierta(conv.contactoId);
    if (!antes) return NextResponse.json({ error: "el contacto no tiene una oportunidad abierta" }, { status: 404 });

    // Primero la etapa/embudo (valida el destino antes de cambiar nada más).
    if (embudo || etapa) {
      const movida = await moverLeadAEtapa(conv.contactoId, etapa ?? null, conv.contacto.nombre, embudo);
      if (!movida.ok) return NextResponse.json(movida, { status: 400 });
    }

    const data: Prisma.OportunidadUpdateInput = {};
    const eventos: Prisma.EventoUncheckedCreateInput[] = [];
    if (valor !== undefined && !valor.equals(antes.valor)) {
      data.valor = valor;
      eventos.push({
        oportunidadId: antes.id,
        tipo: "nota",
        descripcion: `Bot cambió el valor de ${antes.valor.toString()} a ${valor.toString()} ${antes.moneda}`,
        payload: { campo: "valor", antes: antes.valor.toString(), despues: valor.toString() }
      });
    }
    if (responsableId !== undefined && responsableId !== antes.responsableId) {
      data.responsable = responsableId === null ? { disconnect: true } : { connect: { id: responsableId } };
      eventos.push({
        oportunidadId: antes.id,
        tipo: "asignacion",
        descripcion: responsableId === null ? "Bot quitó el responsable" : "Bot cambió el responsable",
        payload: { campo: "responsable", antes: antes.responsableId?.toString() ?? null, despues: responsableId?.toString() ?? null }
      });
    }
    if (Object.keys(data).length) await db.oportunidad.update({ where: { id: antes.id }, data });
    for (const evento of eventos) await db.evento.create({ data: evento });

    const despues = await db.oportunidad.findUniqueOrThrow({ where: { id: antes.id }, include: { etapa: true, embudo: true } });
    await auditarBot(bot, conv.id, "oportunidad_editada", {
      entidad: "oportunidad",
      entidadId: antes.id,
      antes: { valor: antes.valor, responsableId: antes.responsableId, etapaId: antes.etapaId, embudoId: antes.embudoId, estado: antes.estado },
      despues: { valor: despues.valor, responsableId: despues.responsableId, etapaId: despues.etapaId, embudoId: despues.embudoId, estado: despues.estado }
    });

    return NextResponse.json({
      oportunidad: {
        id: Number(despues.id),
        titulo: despues.titulo,
        valor: Number(despues.valor),
        moneda: despues.moneda,
        estado: despues.estado,
        embudo: despues.embudo.nombre,
        etapa: despues.etapa.nombre,
        responsableId: despues.responsableId?.toString() ?? null
      }
    });
  });
}

export const PATCH = conErrores(manejarPATCH);
