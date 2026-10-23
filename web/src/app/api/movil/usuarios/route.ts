import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { puestoPuedeAtenderConversaciones } from "@/lib/modulos-catalogo";
import { requireSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;

  const usuarios = await db.usuario.findMany({
    where: { activo: true },
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true, rol: true, puesto: true },
  });
  return NextResponse.json({
    usuarios: usuarios.map((usuario) => ({
      id: String(usuario.id),
      nombre: usuario.nombre,
      rol: usuario.rol,
      puesto: usuario.puesto,
      puedeAtender: puestoPuedeAtenderConversaciones(usuario.puesto, usuario.rol),
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}
