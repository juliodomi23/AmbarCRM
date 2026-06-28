import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { getProvider } from "@/lib/channel";
import { instanciaPorDefecto } from "@/lib/channel/evolution";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Importa contactos y chats existentes del número (desde Evolution) al CRM.
 * No recibe body. Es idempotente: reusa contacto/conversación por teléfono.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await requireSesion(true);
  if ("error" in s) return s.error;

  const canal = await db.canalWhatsapp.findUnique({ where: { id: BigInt(params.id) } });
  if (!canal) return NextResponse.json({ error: "canal inexistente" }, { status: 404 });

  const provider = getProvider(canal.proveedor);
  if (!provider.obtenerDirectorio) {
    return NextResponse.json({ error: "este proveedor no permite importar" }, { status: 400 });
  }

  const instancia = canal.instancia?.trim() || instanciaPorDefecto;
  const { contactos, chats } = await provider.obtenerDirectorio(instancia);

  let contactosNuevos = 0;
  let chatsNuevos = 0;

  // 1) Contactos (alta/actualización por teléfono).
  for (const c of contactos) {
    if (!c.telefono) continue;
    const existe = await db.contacto.findFirst({ where: { telefono: c.telefono } });
    if (existe) {
      // Solo completa el nombre si seguía siendo el teléfono.
      if (c.nombre && existe.nombre === existe.telefono) {
        await db.contacto.update({ where: { id: existe.id }, data: { nombre: c.nombre } });
      }
    } else {
      await db.contacto.create({
        data: { nombre: c.nombre || c.telefono, telefono: c.telefono, fuente: "whatsapp" }
      });
      contactosNuevos++;
    }
  }

  // 2) Chats -> conversación por contacto+canal.
  for (const ch of chats) {
    if (!ch.telefono) continue;
    const contacto =
      (await db.contacto.findFirst({ where: { telefono: ch.telefono } })) ??
      (await db.contacto.create({
        data: { nombre: ch.nombre || ch.telefono, telefono: ch.telefono, fuente: "whatsapp" }
      }));

    const yaHabia = await db.conversacion.findUnique({
      where: { contactoId_canalId: { contactoId: contacto.id, canalId: canal.id } }
    });
    if (yaHabia) continue;

    const conv = await db.conversacion.create({
      data: { contactoId: contacto.id, canalId: canal.id, ultimoMensajeAt: ch.timestamp ?? new Date() }
    });
    chatsNuevos++;

    // Importa los últimos mensajes (entrantes y salientes) para dar contexto al agente.
    const historial = provider.obtenerMensajes
      ? await provider.obtenerMensajes(instancia, `${ch.telefono}@s.whatsapp.net`, 5)
      : [];

    if (historial.length) {
      for (const h of historial) {
        await db.mensaje.upsert({
          where: { waMessageId: h.waMessageId },
          update: {},
          create: {
            conversacionId: conv.id,
            direccion: h.direccion,
            tipo: h.tipo,
            contenido: h.contenido ?? (h.tipo !== "texto" ? `[${h.tipo}]` : null),
            mediaMime: h.mediaMime ?? null,
            status: h.direccion === "entrante" ? "entregado" : "enviado",
            waMessageId: h.waMessageId,
            timestamp: h.timestamp
          }
        });
      }
      const ult = historial[historial.length - 1];
      await db.conversacion.update({ where: { id: conv.id }, data: { ultimoMensajeAt: ult.timestamp } });
    } else if (ch.ultimoTexto?.trim()) {
      await db.mensaje.create({
        data: {
          conversacionId: conv.id,
          direccion: "entrante",
          tipo: "texto",
          contenido: ch.ultimoTexto,
          status: "entregado",
          timestamp: ch.timestamp ?? new Date()
        }
      });
    }
  }

  return NextResponse.json({
    ok: true,
    contactos: contactos.length,
    contactosNuevos,
    chats: chats.length,
    chatsNuevos
  });
}
