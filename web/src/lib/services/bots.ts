import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { destinoPublico } from "@/lib/webhook-url";
import { decryptMetaToken, encryptMetaToken } from "@/lib/meta/credentials";
import { transaccionTenant } from "@/lib/retail-db";
import { serializar } from "@/lib/serialize";
import { puestoPuedeAtenderConversaciones } from "@/lib/modulos";

const BASE = process.env.NEXTAUTH_URL ?? "";

export function generarToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

/** Lista para la UI: nunca incluye el secreto de firma (solo si ya tiene uno). */
export async function listarBots() {
  const bots = await db.bot.findMany({ orderBy: { id: "asc" }, include: { canal: true } });
  return bots.map(({ signingSecret, ...bot }) => ({ ...bot, firmaActiva: signingSecret != null }));
}

/** Secreto HMAC nuevo: `plano` se muestra una sola vez; `cifrado` es lo que se guarda. */
export function nuevoSecretoFirma() {
  const plano = generarToken();
  return { plano, cifrado: encryptMetaToken(plano) };
}

/** Valor del header X-AmbarCRM-Signature: sha256=<hex del HMAC-SHA256 del cuerpo>. */
export function firmarCuerpo(secretoPlano: string, cuerpo: string) {
  return `sha256=${crypto.createHmac("sha256", secretoPlano).update(cuerpo).digest("hex")}`;
}

/**
 * Firma V2 (anti-repetición): sha256=<hex del HMAC-SHA256 de `${timestamp}.${cuerpo}`>.
 * `timestamp` son segundos unix y viaja en X-AmbarCRM-Timestamp.
 */
export function firmarCuerpoV2(secretoPlano: string, timestamp: string | number, cuerpo: string) {
  return `sha256=${crypto.createHmac("sha256", secretoPlano).update(`${timestamp}.${cuerpo}`).digest("hex")}`;
}

type BotAuditable = { id: bigint };

/**
 * Registra una acción del bot en auditoria_bot. No rompe la acción principal si falla el registro.
 * `tx` permite escribirla dentro de una transacción.
 */
export async function auditarBot(
  bot: BotAuditable,
  conversacionId: bigint | null,
  accion: string,
  datos: { entidad?: string; entidadId?: bigint | null; antes?: unknown; despues?: unknown } = {},
  tx?: Prisma.TransactionClient
) {
  try {
    const data = {
      botId: bot.id,
      conversacionId,
      accion,
      entidad: datos.entidad,
      entidadId: datos.entidadId ?? null,
      antes: datos.antes == null ? undefined : serializar(datos.antes),
      despues: datos.despues == null ? undefined : serializar(datos.despues)
    };
    if (tx) await tx.auditoriaBot.create({ data });
    else await db.auditoriaBot.create({ data });
  } catch (e) {
    console.error(`auditoría del bot ${bot.id} falló (${accion}):`, e instanceof Error ? e.message : e);
  }
}

/**
 * Asesor para un handoff: el fijo del bot si está activo; si no, round-robin entre usuarios activos
 * que puedan atender conversaciones (el Cajero nunca recibe un handoff; ver
 * `puestoPuedeAtenderConversaciones`), tomando el siguiente al último asesor asignado por handoff,
 * según auditoria_bot.
 * `bloquear` (FOR NO KEY UPDATE sobre los usuarios) serializa handoffs simultáneos; solo se
 * desactiva en la prueba de concurrencia para mostrar qué pasa sin protección.
 */
export async function elegirAsesor(
  tx: Prisma.TransactionClient,
  bot: { asesorId: bigint | null },
  bloquear = true
) {
  if (bot.asesorId != null) {
    const fijo = await tx.usuario.findFirst({
      where: { id: bot.asesorId, activo: true },
      select: { id: true, nombre: true }
    });
    if (fijo) return fijo;
  }
  const activos = bloquear
    ? await tx.$queryRaw<{ id: bigint; nombre: string; puesto: string; rol: string }[]>`
        SELECT id, nombre, puesto, rol::text AS rol FROM usuarios WHERE activo ORDER BY id FOR NO KEY UPDATE`
    : await tx.usuario.findMany({
        where: { activo: true },
        orderBy: { id: "asc" },
        select: { id: true, nombre: true, puesto: true, rol: true }
      });
  const usuarios = activos
    .filter((u) => puestoPuedeAtenderConversaciones(u.puesto, u.rol))
    .map(({ id, nombre }) => ({ id, nombre }));
  if (usuarios.length === 0) return null;

  const ultimo = await tx.auditoriaBot.findFirst({
    where: { accion: "handoff" },
    orderBy: { id: "desc" },
    select: { despues: true }
  });
  const previo = (ultimo?.despues as { responsableId?: string } | null)?.responsableId;
  const i = usuarios.findIndex((u) => String(u.id) === previo);
  return usuarios[(i + 1) % usuarios.length];
}

/**
 * Handoff: apaga el bot, deja la conversación pendiente, asigna asesor, nota interna con el motivo
 * y bitácora. Todo en una transacción. Si el bot ya estaba apagado no hace nada (idempotente).
 */
export async function escalarAHumano(
  bot: { id: bigint; orgId: bigint; asesorId: bigint | null },
  conversacionId: bigint,
  motivo: string,
  bloquear = true
) {
  return transaccionTenant(bot.orgId, async (tx) => {
    const conv = await tx.conversacion.findUnique({ where: { id: conversacionId } });
    if (!conv) return null;
    if (!conv.botActivo) return { escalada: false as const, responsableId: conv.responsableId };

    const asesor = conv.responsableId != null ? null : await elegirAsesor(tx, bot, bloquear);
    const responsableId = conv.responsableId ?? asesor?.id ?? null;
    await tx.conversacion.update({
      where: { id: conv.id },
      data: { botActivo: false, estado: "pendiente", responsableId }
    });
    const destino = asesor ? `Asignada a ${asesor.nombre}.` : responsableId ? "Conserva su responsable." : "Sin asesor disponible.";
    await tx.mensaje.create({
      data: {
        conversacionId: conv.id,
        direccion: "saliente",
        tipo: "texto",
        interna: true,
        status: "enviado",
        contenido: `Handoff del bot: ${motivo} ${destino}`
      }
    });
    await auditarBot(
      bot,
      conv.id,
      "handoff",
      {
        entidad: "conversacion",
        entidadId: conv.id,
        antes: { botActivo: true, estado: conv.estado, responsableId: conv.responsableId },
        despues: { botActivo: false, estado: "pendiente", responsableId, motivo }
      },
      tx
    );
    return { escalada: true as const, responsableId };
  });
}

/** Bot activo aplicable a un canal: prioriza el específico del canal, si no, el global (canalId null). */
export async function botParaCanal(canalId: bigint | null) {
  const bots = await db.bot.findMany({ where: { activo: true } });
  if (bots.length === 0) return null;
  const especifico = canalId != null ? bots.find((b) => b.canalId === canalId) : undefined;
  return especifico ?? bots.find((b) => b.canalId === null) ?? null;
}

function absoluto(url: string) {
  return url.startsWith("http") ? url : `${BASE}${url}`;
}

type DatosDispatch = {
  conversacionId: bigint;
  contactoId: bigint;
  telefono: string;
  nombre: string;
  botActivo: boolean;
  mensaje: { id: bigint; tipo: string; contenido: string | null; mediaUrl: string | null };
};

/**
 * Manda el mensaje entrante al webhook del bot con el evento `message_created` de AmbarCRM.
 */
export async function dispatchABot(bot: { webhookUrl: string; signingSecret?: string | null }, d: DatosDispatch) {
  // El valor también se valida al guardar, pero se vuelve a comprobar aquí
  // para proteger ejecuciones con datos antiguos o migrados.
  if (!(await destinoPublico(bot.webhookUrl))) {
    console.error(`dispatch a bot bloqueado: ${bot.webhookUrl} no es un destino público`);
    return;
  }
  const sender = { identifier: d.telefono, name: d.nombre, phone_number: `+${d.telefono}` };
  const attachments =
    d.mensaje.mediaUrl && d.mensaje.tipo !== "texto"
      ? [{ file_type: d.mensaje.tipo, data_url: absoluto(d.mensaje.mediaUrl) }]
      : [];

  const payload = {
    event: "message_created",
    message_type: "incoming",
    id: d.mensaje.id.toString(),
    content: d.mensaje.contenido ?? "",
    created_at: new Date().toISOString(),
    conversation: {
      id: Number(d.conversacionId),
      status: "open",
      labels: d.botActivo ? [] : ["bot_off"],
      meta: { sender }
    },
    sender,
    attachments,
    account: { id: 1 },
    // Atajos propios de AmbarCRM para workflows nuevos:
    ambarcrm: {
      conversacionId: d.conversacionId.toString(),
      contactoId: d.contactoId.toString(),
      telefono: d.telefono,
      nombre: d.nombre,
      responder_url: `${BASE}/api/v1/accounts/1/conversations/${d.conversacionId}/messages`,
      handoff_url: `${BASE}/api/v1/accounts/1/conversations/${d.conversacionId}/labels`,
      funnel_url: `${BASE}/api/v1/accounts/1/conversations/${d.conversacionId}/funnel`,
      citas_url:
        `${BASE}/api/v1/accounts/1/conversations/` +
        `${d.conversacionId}/appointments`
    }
  };

  const cuerpo = JSON.stringify(payload);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let intentos = 2;
  if (bot.signingSecret) {
    try {
      const secreto = decryptMetaToken(bot.signingSecret);
      const timestamp = String(Math.floor(Date.now() / 1000));
      // La V1 no cambia (hay n8n en producción que la verifica); la V2 agrega la marca de tiempo.
      headers["X-AmbarCRM-Signature"] = firmarCuerpo(secreto, cuerpo);
      headers["X-AmbarCRM-Timestamp"] = timestamp;
      headers["X-AmbarCRM-Signature-V2"] = firmarCuerpoV2(secreto, timestamp, cuerpo);
    } catch (e) {
      // No se manda sin firma: n8n la exige. Cae al aviso interno de abajo.
      console.error("no se pudo firmar el dispatch al bot:", e instanceof Error ? e.message : e);
      intentos = 0;
    }
  }

  // 2 intentos: si n8n tiene un hipo, reintenta una vez antes de rendirse.
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(bot.webhookUrl, {
        method: "POST",
        headers,
        body: cuerpo,
        signal: ctrl.signal,
        redirect: "manual"
      });
      clearTimeout(t);
      if (res.ok) return;
      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      console.error(
        `dispatch a bot falló (intento ${intento}, conv ${d.conversacionId}):`,
        e instanceof Error ? e.message : e,
      );
      if (intento < 2) await new Promise((r) => setTimeout(r, 1500));
    }
  }

  // Tras los reintentos: deja una nota interna VISIBLE en el chat para que el agente
  // responda a mano (en vez de perder el lead en silencio).
  await db.mensaje.create({
    data: {
      conversacionId: d.conversacionId,
      direccion: "saliente",
      tipo: "texto",
      interna: true,
      status: "enviado",
      contenido: "Aviso del sistema: el bot no recibió este mensaje (n8n no respondió). Responde manualmente."
    }
  }).catch(() => {});
}
