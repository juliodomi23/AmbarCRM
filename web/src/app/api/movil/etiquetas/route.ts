import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;

  const etiquetas = await db.etiqueta.findMany({
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true, color: true },
  });
  return NextResponse.json({
    etiquetas: etiquetas.map((etiqueta) => ({
      id: String(etiqueta.id), nombre: etiqueta.nombre, color: etiqueta.color,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}
