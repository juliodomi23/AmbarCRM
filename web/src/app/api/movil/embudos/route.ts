import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;

  const embudos = await db.embudo.findMany({
    where: { activo: true }, orderBy: { orden: "asc" },
    select: { id: true, nombre: true, orden: true, descripcion: true },
  });
  return NextResponse.json({
    embudos: embudos.map((embudo) => ({
      id: String(embudo.id), nombre: embudo.nombre,
      orden: embudo.orden, descripcion: embudo.descripcion,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}
