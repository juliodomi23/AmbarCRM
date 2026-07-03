import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { Client } from "pg";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-Sent Events: abre una conexión PG dedicada que hace LISTEN 'nuevo_mensaje'
 * (el trigger de la tabla mensajes hace NOTIFY) y reenvía cada evento al navegador.
 * Solo reenvía eventos de la org de la sesión (el payload trae org_id); el cliente
 * filtra por conversacion_id.
 */
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new Response("no autorizado", { status: 401 });
  const orgId = session.user.orgId ? String(session.user.orgId) : null;

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  const encoder = new TextEncoder();
  let keepAlive: ReturnType<typeof setInterval>;

  const stream = new ReadableStream({
    async start(controller) {
      const push = (data: string) => {
        try { controller.enqueue(encoder.encode(data)); } catch { /* cerrado */ }
      };
      // Si la conexión PG cae, cerramos el stream para que EventSource reconecte
      // (si no, queda un stream zombi que ya no entrega mensajes).
      client.on("error", () => {
        clearInterval(keepAlive);
        try { controller.close(); } catch { /* ya cerrado */ }
      });
      await client.connect();
      await client.query("LISTEN nuevo_mensaje");
      client.on("notification", (n) => {
        if (!n.payload) return;
        // Filtro de tenant: si el evento trae org_id y no es la org de la sesión, no se reenvía.
        // (Eventos sin org_id = trigger viejo aún sin actualizar: se reenvían para no romper.)
        try {
          const evOrg = JSON.parse(n.payload)?.org_id;
          if (evOrg != null && orgId != null && String(evOrg) !== orgId) return;
        } catch { /* payload no-JSON: se reenvía tal cual */ }
        push(`data: ${n.payload}\n\n`);
      });
      push(": conectado\n\n");
      keepAlive = setInterval(() => push(": keepalive\n\n"), 25000);
    },
    async cancel() {
      clearInterval(keepAlive);
      await client.end().catch(() => {});
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
