import { NextRequest } from "next/server";
import { db } from "@/lib/db";

/**
 * Autentica un bot por su token. Acepta el header `api_access_token` (igual que Chatwoot)
 * o `x-bot-token`. Devuelve el bot o null.
 */
export async function requireBot(req: NextRequest) {
  const token = req.headers.get("api_access_token") || req.headers.get("x-bot-token");
  if (!token) return null;
  return db.bot.findUnique({ where: { apiToken: token } });
}

/**
 * Un bot global (canalId null) opera en cualquier canal; uno atado a un canal
 * solo puede tocar conversaciones de ESE canal. Evita que un token acceda a chats ajenos.
 */
export function botAutorizado(bot: { canalId: bigint | null }, conv: { canalId: bigint | null }) {
  return bot.canalId === null || bot.canalId === conv.canalId;
}
