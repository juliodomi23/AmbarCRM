import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { serializar } from "@/lib/serialize";
import { contactosQueCoinciden } from "@/lib/busqueda";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ resultados: [] });
  const ids = await contactosQueCoinciden(q, 50);
  const [contactos, conversaciones] = await Promise.all([
    db.contacto.findMany({
      where: { id: { in: ids.slice(0, 6) } },
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true, telefono: true, empresa: true }
    }),
    db.conversacion.findMany({
      where: { contactoId: { in: ids } },
      take: 6,
      orderBy: { ultimoMensajeAt: "desc" },
      select: { id: true, estado: true, noLeidos: true, contacto: { select: { nombre: true, telefono: true } } }
    })
  ]);
  return NextResponse.json(serializar({
    resultados: [
      ...contactos.map((c) => ({ id: `contacto-${c.id}`, tipo: "Contacto", titulo: c.nombre, detalle: c.empresa || c.telefono || "", href: `/contactos?q=${encodeURIComponent(c.nombre)}` })),
      ...conversaciones.map((c) => ({ id: `conversacion-${c.id}`, tipo: "Conversación", titulo: c.contacto.nombre, detalle: c.noLeidos ? `${c.noLeidos} sin leer` : c.estado, href: `/chat?conv=${c.id}` }))
    ]
  }));
}
