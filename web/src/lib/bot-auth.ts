import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db, dbRaw, runWithOrg } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { moduloHabilitado, type ClaveModulo } from "@/lib/modulos";
import { ipCliente, permitido } from "@/lib/rate-limit";

/**
 * Autentica un bot por su token mediante el header `api_access_token` o `x-bot-token`.
 * Devuelve el bot (con su orgId) o null.
 *
 * El token es global; primero resolvemos su org con una función SECURITY DEFINER (salta RLS) y
 * luego leemos el bot dentro del tenant. NO deja ningún tenant fijado al terminar: las consultas
 * siguientes solo ven datos si corren dentro de `conBot`/`runWithOrg` (si no, RLS devuelve 0 filas).
 */
export async function requireBot(req: NextRequest) {
  const token = tokenDe(req);
  if (!token) return null;

  const r = await dbRaw.$queryRawUnsafe<{ org: bigint | null }[]>(
    "SELECT resolve_org_by_bot_token($1) AS org", token
  );
  const orgId = r[0]?.org;
  if (orgId == null) return null;
  return runWithOrg(orgId, () => db.bot.findUnique({ where: { apiToken: token } }));
}

export type BotAutenticado = NonNullable<Awaited<ReturnType<typeof requireBot>>>;

const tokenDe = (req: NextRequest) => req.headers.get("api_access_token") || req.headers.get("x-bot-token");
const numero = (valor: string | undefined, defecto: number) => Number(valor) || defecto;

function limitado(ventanaMs: number) {
  return NextResponse.json(
    { error: "demasiadas peticiones" },
    { status: 429, headers: { "Retry-After": String(Math.ceil(ventanaMs / 1000)) } }
  );
}

/**
 * Punto de entrada ÚNICO de las rutas /api/v1 del bot: limita, autentica y ejecuta `handler`
 * dentro de `runWithOrg(bot.orgId)` (AsyncLocalStorage.run: el tenant vale solo dentro del callback
 * y no se filtra a otras peticiones). Una ruta que no use este helper corre sin tenant y no ve datos.
 *
 * Límites por entorno:
 *  - por token: BOT_RATE_LIMIT_MAX (300) por BOT_RATE_LIMIT_WINDOW_MS (60000)
 *  - tokens inválidos por IP: BOT_AUTH_FAIL_MAX (20) por BOT_AUTH_FAIL_WINDOW_MS (300000)
 * `ipCliente` confía en cf-connecting-ip / x-forwarded-for: sirve detrás de Cloudflare/proxy; si el
 * CRM quedara expuesto directo, un atacante podría rotar la IP declarada.
 */
export async function conBot(req: NextRequest, handler: (bot: BotAutenticado) => Promise<Response | undefined>) {
  const token = tokenDe(req);
  if (token) {
    const ventanaMs = numero(process.env.BOT_RATE_LIMIT_WINDOW_MS, 60_000);
    const clave = `bot-api:${createHash("sha256").update(token).digest("base64url")}`;
    if (!permitido(clave, numero(process.env.BOT_RATE_LIMIT_MAX, 300), ventanaMs)) return limitado(ventanaMs);
  }

  const bot = await requireBot(req);
  if (!bot) {
    // Intentos con token inválido (o ausente) por IP. Pasado el tope se responde 429 en vez de 401;
    // un token válido nunca se bloquea por la IP (varios bots comparten la IP del servidor de n8n).
    const ventanaMs = numero(process.env.BOT_AUTH_FAIL_WINDOW_MS, 300_000);
    const claveIp = `bot-401:${ipCliente(Object.fromEntries(req.headers))}`;
    if (!permitido(claveIp, numero(process.env.BOT_AUTH_FAIL_MAX, 20), ventanaMs)) return limitado(ventanaMs);
    return NextResponse.json({ error: "token inválido" }, { status: 401 });
  }
  const respuesta = await runWithOrg(bot.orgId, () => handler(bot));
  return respuesta ?? NextResponse.json({ error: "sin respuesta" }, { status: 500 });
}

/**
 * Dentro de `conBot`: exige que el módulo esté activo para la empresa (sin depender de sesión de
 * usuario), valida el id y el canal del bot, y devuelve la conversación con su contacto.
 * Uso: `const a = await conversacionDelBot(bot, id, "citas"); if (!a.conv) return a.respuesta;`
 */
export async function conversacionDelBot(bot: BotAutenticado, conversationId: string, modulo: ClaveModulo) {
  const error = (mensaje: string, status: number) =>
    ({ bot: null, conv: null, respuesta: NextResponse.json({ error: mensaje }, { status }) }) as const;
  if (!(await moduloHabilitado(modulo))) return error("módulo no activo", 404);
  const id = aBigInt(conversationId);
  if (id === null) return error("conversationId inválido", 400);
  const conv = await db.conversacion.findUnique({ where: { id }, include: { contacto: true } });
  if (!conv) return error("conversación inexistente", 404);
  if (!botAutorizado(bot, conv)) return error("el bot no opera en este canal", 403);
  return { bot, conv, respuesta: null } as const;
}

/**
 * Un bot global (canalId null) opera en cualquier canal; uno atado a un canal
 * solo puede tocar conversaciones de ESE canal. Evita que un token acceda a chats ajenos.
 */
export function botAutorizado(bot: { canalId: bigint | null }, conv: { canalId: bigint | null }) {
  return bot.canalId === null || bot.canalId === conv.canalId;
}
