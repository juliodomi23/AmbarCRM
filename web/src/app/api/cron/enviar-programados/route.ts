import { NextRequest, NextResponse } from "next/server";
import { db, dbRaw, runWithOrg } from "@/lib/db";
import { requireApiKey } from "@/lib/api-auth";
import { getProvider } from "@/lib/channel";

export const dynamic = "force-dynamic";

/**
 * Envía los mensajes programados vencidos de TODOS los tenants.
 * Para que n8n lo llame con un Schedule Trigger cada minuto.
 * Header: x-api-key = WA_API_KEY.
 */
export async function POST(req: NextRequest) {
  const noAuth = requireApiKey(req);
  if (noAuth) return noAuth;

  const orgs = await dbRaw.$queryRawUnsafe<{ id: bigint }[]>("SELECT id FROM orgs WHERE activo = true");
  let enviados = 0;
  let fallidos = 0;

  for (const o of orgs) {
    await runWithOrg(o.id, async () => {
      const vencidos = await db.mensajeProgramado.findMany({
        where: { estado: "pendiente", enviarAt: { lte: new Date() } },
        include: { conversacion: { include: { contacto: true, canal: true } } },
        take: 50
      });

      for (const p of vencidos) {
        const { conversacion: conv } = p;
        if (!conv.contacto.telefono) {
          await db.mensajeProgramado.update({ where: { id: p.id }, data: { estado: "fallido" } });
          fallidos++;
          continue;
        }
        const provider = getProvider(conv.canal?.proveedor ?? "evolution", conv.canal?.config, conv.canal?.instancia);
        const envio = await provider.enviarTexto(conv.contacto.telefono, p.contenido);

        await db.mensaje.create({
          data: {
            conversacionId: conv.id,
            direccion: "saliente",
            tipo: "texto",
            contenido: p.contenido,
            status: envio.ok ? "enviado" : "fallido",
            waMessageId: envio.waMessageId,
            enviadoPor: p.creadoPor
          }
        });
        await db.mensajeProgramado.update({ where: { id: p.id }, data: { estado: envio.ok ? "enviado" : "fallido" } });
        await db.conversacion.update({ where: { id: conv.id }, data: { ultimoMensajeAt: new Date() } });
        envio.ok ? enviados++ : fallidos++;
      }
    });
  }

  return NextResponse.json({ ok: true, enviados, fallidos });
}
