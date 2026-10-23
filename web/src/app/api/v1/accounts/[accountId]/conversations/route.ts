import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { conBot } from "@/lib/bot-auth";
import { conversacionInclude, serializarConversacion, serializarMensaje, type MensajeBot } from "@/lib/bot-conversations-read";

export const dynamic = "force-dynamic";

const error = (campo: string) => NextResponse.json({ error: `${campo} inválido` }, { status: 400 });

function entero(valor: string | null, defecto: number, maximo?: number) {
  if (valor === null) return defecto;
  if (!/^[1-9]\d*$/.test(valor)) return null;
  const numero = Number(valor);
  return Number.isSafeInteger(numero) && (!maximo || numero <= maximo) ? numero : null;
}

function fecha(valor: string | null) {
  if (valor === null) return undefined;
  const ms = /^\d+$/.test(valor) ? Number(valor) * 1000 : Date.parse(valor);
  if (!Number.isFinite(ms) || !/^\d+$/.test(valor) && !/^\d{4}-\d{2}-\d{2}T/.test(valor)) return null;
  const resultado = new Date(ms);
  return Number.isNaN(resultado.getTime()) ? null : resultado;
}

export async function GET(req: NextRequest) {
  return conBot(req, null, async (bot) => {
    if (!bot.permisos.includes("leer_perfil")) return NextResponse.json({ error: "permiso_faltante" }, { status: 403 });
    const params = req.nextUrl.searchParams;
    const status = params.get("status") ?? "all";
    if (!["all", "open", "resolved"].includes(status)) return error("status");
    const include = params.get("include");
    if (include !== null && include !== "messages") return error("include");
    const privateParam = params.get("include_private");
    if (privateParam !== null && privateParam !== "true" && privateParam !== "false") return error("include_private");
    const includePrivate = privateParam === "true";
    if (includePrivate && !bot.permisos.includes("notas_internas")) {
      return NextResponse.json({ error: "permiso_faltante", permiso: "notas_internas" }, { status: 403 });
    }
    const page = entero(params.get("page"), 1);
    const perPage = entero(params.get("per_page"), 25, include === "messages" ? 50 : 100);
    if (page === null) return error("page");
    if (perPage === null) return error("per_page");
    const skip = (page - 1) * perPage;
    if (!Number.isSafeInteger(skip)) return error("page");

    const fechas = {
      updatedAfter: fecha(params.get("updated_after")), updatedBefore: fecha(params.get("updated_before")),
      createdAfter: fecha(params.get("created_after")), createdBefore: fecha(params.get("created_before"))
    };
    for (const [campo, valor] of Object.entries(fechas)) if (valor === null) return error(campo);

    const labels = [...new Set([...params.getAll("labels[]"), ...params.getAll("labels")].map((l) => l.trim()).filter(Boolean))];
    const etapa = params.get("etapa")?.trim();
    const and: Prisma.ConversacionWhereInput[] = labels.map((label) => label === "bot_off"
      ? { botActivo: false }
      : { contacto: { etiquetas: { some: { etiqueta: { nombre: label } } } } });
    if (etapa) and.push({ contacto: { oportunidades: { some: { estado: "abierto", etapa: { nombre: etapa } } } } });
    const where: Prisma.ConversacionWhereInput = {
      orgId: bot.orgId,
      ...(bot.canalId === null ? {} : { canalId: bot.canalId }),
      ...(status === "open" ? { estado: "abierta" } : status === "resolved" ? { estado: "cerrada" } : {}),
      ...(fechas.updatedAfter || fechas.updatedBefore ? { updatedAt: {
        ...(fechas.updatedAfter ? { gt: fechas.updatedAfter } : {}),
        ...(fechas.updatedBefore ? { lt: fechas.updatedBefore } : {})
      } } : {}),
      ...(fechas.createdAfter || fechas.createdBefore ? { createdAt: {
        ...(fechas.createdAfter ? { gt: fechas.createdAfter } : {}),
        ...(fechas.createdBefore ? { lt: fechas.createdBefore } : {})
      } } : {}),
      ...(and.length ? { AND: and } : {})
    };
    const pagina = { where, skip, take: perPage, orderBy: [{ updatedAt: "asc" as const }, { id: "asc" as const }] };
    const [total, conversaciones] = await Promise.all([
      db.conversacion.count({ where }),
      include === "messages"
        ? db.conversacion.findMany({ ...pagina, include: conversacionInclude })
        : db.conversacion.findMany({ ...pagina, include: {
            ...conversacionInclude,
            mensajes: { where: includePrivate ? {} : { interna: false },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 20,
              include: { usuario: { select: { id: true, nombre: true } } } }
          } })
    ]);
    const contactoIds = [...new Set(conversaciones.map((c) => c.contactoId))];
    const oportunidades = contactoIds.length ? await db.oportunidad.findMany({
      where: { contactoId: { in: contactoIds }, estado: "abierto" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { etapa: { select: { nombre: true } } }
    }) : [];
    const porContacto = new Map<bigint, (typeof oportunidades)[number]>();
    for (const oportunidad of oportunidades) if (!porContacto.has(oportunidad.contactoId)) porContacto.set(oportunidad.contactoId, oportunidad);

    const porConversacion = new Map<bigint, { mensajes: MensajeBot[]; truncated: boolean }>();
    if (include === "messages") {
      for (let inicio = 0; inicio < conversaciones.length; inicio += 10) {
        const bloque = conversaciones.slice(inicio, inicio + 10);
        const resultados = await Promise.all(bloque.map((conv) => db.mensaje.findMany({
          where: { conversacionId: conv.id, ...(includePrivate ? {} : { interna: false }) },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 501,
          include: { usuario: { select: { id: true, nombre: true } } }
        })));
        bloque.forEach((conv, indice) => porConversacion.set(conv.id, {
          mensajes: resultados[indice].slice(0, 500).reverse(),
          truncated: resultados[indice].length > 500
        }));
      }
    }
    const payload = conversaciones.map((conv) => {
      const incluidos = porConversacion.get(conv.id);
      const recientesDesc = incluidos ? incluidos.mensajes.slice().reverse() : "mensajes" in conv ? conv.mensajes as MensajeBot[] : [];
      const recientes = recientesDesc.slice(0, 20).reverse();
      const ultimo = recientesDesc[0] ?? null;
      return serializarConversacion(
        conv, recientes, porContacto.get(conv.contactoId) ?? null, ultimo,
        {
          etiquetasEnLabels: true,
          ...(incluidos ? {
            messages: incluidos.mensajes.map((m) => serializarMensaje(m, conv.contacto, bot)),
            messagesTruncated: incluidos.truncated
          } : {})
        }
      );
    });
    return NextResponse.json({ meta: { total, page, per_page: perPage, total_pages: Math.ceil(total / perPage) }, payload });
  });
}
