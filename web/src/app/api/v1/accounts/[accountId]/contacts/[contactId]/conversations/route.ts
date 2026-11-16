import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { botAutorizado, conBot } from "@/lib/bot-auth";
import { db } from "@/lib/db";
import { conErrores } from "@/lib/errores-api";
import { aBigInt } from "@/lib/ids";
import {
  conversacionInclude,
  serializarConversacion,
  type OportunidadBot
} from "@/lib/bot-conversations-read";
import { auditarBot, notaDelBot } from "@/lib/services/bots";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ accountId: string; contactId: string }> };

/** Igual que el listado `/conversations` (últimos 20 mensajes visibles) para devolver el mismo shape. */
const includeConversacion = {
  ...conversacionInclude,
  mensajes: {
    where: { interna: false },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 20,
    include: { usuario: { select: { id: true, nombre: true } } }
  }
} satisfies Prisma.ConversacionInclude;

type ConversacionConMensajes = Prisma.ConversacionGetPayload<{ include: typeof includeConversacion }>;

const ESTADOS = { open: "abierta", resolved: "cerrada", all: null } as const;

/** Cada elemento es idéntico a los del `GET /conversations` (incluye etiquetas del contacto en `labels`). */
function vista(conv: ConversacionConMensajes, oportunidad: OportunidadBot | null) {
  return serializarConversacion(
    conv,
    conv.mensajes.slice(0, 20).reverse(),
    oportunidad,
    conv.mensajes[0] ?? null,
    { etiquetasEnLabels: true }
  );
}

const oportunidadAbierta = (contactoId: bigint) =>
  db.oportunidad.findFirst({
    where: { contactoId, estado: "abierto" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { etapa: { select: { nombre: true } } }
  });

const errorContacto = () => NextResponse.json({ error: "contactId inválido" }, { status: 400 });

/**
 * GET /api/v1/accounts/:accountId/contacts/:contactId/conversations — permiso `gestionar_contactos`.
 * Misma lógica y mismo shape que `GET /conversations?contact_id=`, sin paginación: la más reciente primero,
 * máximo 100. `?status=open|resolved|all` (por defecto `all`). Un bot atado a un canal solo ve su canal.
 */
async function manejarGET(req: NextRequest, props: Props) {
  const { contactId } = await props.params;
  return conBot(req, "gestionar_contactos", async (bot) => {
    const id = aBigInt(contactId);
    if (id === null || id <= 0n) return errorContacto();
    const contacto = await db.contacto.findUnique({ where: { id }, select: { id: true } });
    if (!contacto) return NextResponse.json({ error: "contacto inexistente" }, { status: 404 });

    const status = req.nextUrl.searchParams.get("status") ?? "all";
    if (!Object.hasOwn(ESTADOS, status)) return NextResponse.json({ error: "status inválido" }, { status: 400 });
    const estado = ESTADOS[status as keyof typeof ESTADOS];

    const conversaciones = await db.conversacion.findMany({
      where: {
        orgId: bot.orgId,
        contactoId: id,
        ...(bot.canalId === null ? {} : { canalId: bot.canalId }),
        ...(estado === null ? {} : { estado })
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 100,
      include: includeConversacion
    });
    const oportunidad = await oportunidadAbierta(id);
    const payload = conversaciones.map((conv) => vista(conv, oportunidad));
    return NextResponse.json({ meta: { count: payload.length }, payload });
  });
}

type CanalResuelto = { canalId: bigint } | { respuesta: Response };

/**
 * Canal de la conversación nueva: `canal_id` del body → canal del bot → canal del contacto
 * (Messenger/Instagram) → canal de una conversación previa del contacto → el único canal activo
 * de la empresa. Sin candidato responde 422 `canal_no_determinado`.
 */
async function resolverCanal(
  bot: { orgId: bigint; canalId: bigint | null },
  contacto: { id: bigint; canalId: bigint | null },
  body: Record<string, unknown>
): Promise<CanalResuelto> {
  const pedido = body.canal_id ?? body.canalId ?? body.inbox_id;
  if (pedido !== undefined && pedido !== null) {
    const canalId = typeof pedido === "number" || typeof pedido === "string" ? aBigInt(String(pedido)) : null;
    if (canalId === null || canalId <= 0n) return { respuesta: NextResponse.json({ error: "canal_id inválido" }, { status: 400 }) };
    const canal = await db.canalWhatsapp.findUnique({ where: { id: canalId }, select: { id: true } });
    if (!canal) return { respuesta: NextResponse.json({ error: "canal inexistente" }, { status: 404 }) };
    if (!botAutorizado(bot, { canalId })) {
      return { respuesta: NextResponse.json({ error: "el bot no opera en este canal" }, { status: 403 }) };
    }
    return { canalId };
  }
  if (bot.canalId !== null) return { canalId: bot.canalId };
  if (contacto.canalId !== null) return { canalId: contacto.canalId };

  const previa = await db.conversacion.findFirst({
    where: { contactoId: contacto.id, canalId: { not: null } },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: { canalId: true }
  });
  if (previa?.canalId != null) return { canalId: previa.canalId };

  const canales = await db.canalWhatsapp.findMany({
    where: { activo: true },
    orderBy: [{ id: "asc" }],
    select: { id: true, nombre: true }
  });
  if (canales.length === 1) return { canalId: canales[0].id };
  return {
    respuesta: NextResponse.json(
      {
        error: "no se puede determinar el canal",
        motivo: "canal_no_determinado",
        canales: canales.map((c) => ({ id: Number(c.id), nombre: c.nombre }))
      },
      { status: 422 }
    )
  };
}

/**
 * POST /api/v1/accounts/:accountId/contacts/:contactId/conversations — permiso `gestionar_contactos`.
 * Body opcional: { canal_id | canalId | inbox_id }. Devuelve la conversación abierta/pendiente del contacto
 * en ese canal; si no existe la crea y, si está cerrada, la reabre (el CRM tiene una sola conversación por
 * contacto+canal). Reabrir no enciende el bot. Respuesta: `{ conversacion, creada, reabierta }`.
 */
async function manejarPOST(req: NextRequest, props: Props) {
  const { contactId } = await props.params;
  return conBot(req, "gestionar_contactos", async (bot) => {
    const id = aBigInt(contactId);
    if (id === null || id <= 0n) return errorContacto();
    const contacto = await db.contacto.findUnique({ where: { id } });
    if (!contacto) return NextResponse.json({ error: "contacto inexistente" }, { status: 404 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "body inválido" }, { status: 400 });
    }
    // `POST /conversations` de Chatwoot acepta `message`: aquí el primer mensaje va por `/messages`,
    // que exige `enviar_mensaje`. Se rechaza para no perderlo en silencio.
    if (body.message !== undefined && body.message !== null) {
      return NextResponse.json(
        { error: "el mensaje inicial no se envía aquí; usa POST …/messages", motivo: "mensaje_inicial_no_soportado" },
        { status: 400 }
      );
    }
    const canal = await resolverCanal(bot, contacto, body);
    if ("respuesta" in canal) return canal.respuesta;

    const clave = { contactoId_canalId: { contactoId: id, canalId: canal.canalId } };
    let conv = await db.conversacion.findUnique({ where: clave, include: includeConversacion });
    let creada = false;
    if (!conv) {
      try {
        conv = await db.conversacion.create({
          data: { contactoId: id, canalId: canal.canalId, responsableId: contacto.responsableId },
          include: includeConversacion
        });
        creada = true;
      } catch (error) {
        // Dos peticiones a la vez: la segunda pierde contra el índice único (contacto, canal).
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          conv = await db.conversacion.findUnique({ where: clave, include: includeConversacion });
        }
        if (!conv) throw error;
      }
    }

    let reabierta = false;
    if (!creada && conv.estado === "cerrada") {
      conv = await db.conversacion.update({
        where: { id: conv.id },
        data: { estado: "abierta" },
        include: includeConversacion
      });
      reabierta = true;
    }

    if (creada) {
      await auditarBot(bot, conv.id, "conversacion_creada", {
        entidad: "conversacion",
        entidadId: conv.id,
        despues: { contactoId: id, canalId: canal.canalId, estado: conv.estado }
      });
      await notaDelBot(conv.id, "Creó la conversación");
    } else if (reabierta) {
      await auditarBot(bot, conv.id, "conversacion_reabierta", {
        entidad: "conversacion",
        entidadId: conv.id,
        antes: { estado: "cerrada" },
        despues: { estado: "abierta" }
      });
      await notaDelBot(conv.id, "Reabrió la conversación");
    }

    const oportunidad = await oportunidadAbierta(id);
    return NextResponse.json(
      { conversacion: vista(conv, oportunidad), creada, reabierta },
      { status: creada ? 201 : 200 }
    );
  });
}

export const GET = conErrores(manejarGET);
export const POST = conErrores(manejarPOST);
