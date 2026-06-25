import { NextRequest } from "next/server";
import { Client } from "pg";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-Sent Events: abre una conexión PG dedicada que hace LISTEN 'nuevo_mensaje'
 * (el trigger de la tabla mensajes hace NOTIFY) y reenvía cada evento al navegador.
 * El cliente filtra por conversacion_id.
 */
export async function GET(_req: NextRequest) {
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
      client.on("notification", (n) => push(`data: ${n.payload}\n\n`));
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
