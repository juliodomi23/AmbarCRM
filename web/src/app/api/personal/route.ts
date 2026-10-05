import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { serializar } from "@/lib/serialize";

export const dynamic = "force-dynamic";

/** Lista conversaciones de contactos marcados como personales (familia/amigos). */
export async function GET() {
  const s = await requireSesion();
  if ("error" in s) return s.error;

  const convs = serializar(
    await db.conversacion.findMany({
      where: { contacto: { esPersonal: true } },
      orderBy: { ultimoMensajeAt: "desc" },
      include: {
        contacto: true,
        mensajes: { orderBy: { timestamp: "desc" }, take: 1 }
      }
    })
  );

  const personal = convs.map((c: any) => ({
    id: c.id,
    contactoId: c.contacto.id,
    nombre: c.contacto.nombre,
    telefono: c.contacto.telefono,
    noLeidos: c.noLeidos,
    ultimoMensajeAt: c.ultimoMensajeAt,
    preview: c.mensajes[0]?.contenido ?? (c.mensajes[0] ? "[archivo]" : "")
  }));

  return NextResponse.json({ personal });
}
