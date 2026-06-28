import { NextRequest } from "next/server";
import { db, dbRaw, setOrg } from "@/lib/db";

/**
 * Autentica un bot por su token. Acepta el header `api_access_token` (igual que Chatwoot)
 * o `x-bot-token`. Devuelve el bot (con su orgId) o null.
 *
 * El token es global; primero resolvemos su org con una función SECURITY DEFINER
 * (salta RLS), y luego leemos el bot ya dentro del tenant.
 */
export async function requireBot(req: NextRequest) {
  const token = req.headers.get("api_access_token") || req.headers.get("x-bot-token");
  if (!token) return null;

  const r = await dbRaw.$queryRawUnsafe<{ org: bigint | null }[]>(
    "SELECT resolve_org_by_bot_token($1) AS org", token
  );
  const orgId = r[0]?.org;
  if (orgId == null) return null;

  // Fija el tenant para el resto del request: las queries siguientes del handler
  // (db.conversacion, db.mensaje…) quedan automáticamente acotadas a esta org.
  setOrg(orgId);
  return db.bot.findUnique({ where: { apiToken: token } });
}

/**
 * Un bot global (canalId null) opera en cualquier canal; uno atado a un canal
 * solo puede tocar conversaciones de ESE canal. Evita que un token acceda a chats ajenos.
 */
export function botAutorizado(bot: { canalId: bigint | null }, conv: { canalId: bigint | null }) {
  return bot.canalId === null || bot.canalId === conv.canalId;
}
