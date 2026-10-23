import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;

  const filtro = req.nextUrl.searchParams.get("completada");
  if (filtro !== null && filtro !== "true" && filtro !== "false") {
    return NextResponse.json({ error: "completada inválida" }, { status: 400 });
  }
  const filas = await db.tarea.findMany({
    where: filtro === null ? undefined : { completada: filtro === "true" },
    orderBy: [{ completada: "asc" }, { venceAt: "asc" }, { id: "asc" }],
    take: 501,
    select: {
      id: true, titulo: true, descripcion: true, venceAt: true, completada: true,
      responsableId: true, responsable: { select: { nombre: true } },
      oportunidad: { select: { id: true, titulo: true, contacto: { select: { nombre: true } } } },
    },
  });
  return NextResponse.json({
    tareas: filas.slice(0, 500).map((tarea) => ({
      id: String(tarea.id), titulo: tarea.titulo, descripcion: tarea.descripcion,
      venceAt: tarea.venceAt?.toISOString() ?? null, completada: tarea.completada,
      responsableId: tarea.responsableId ? String(tarea.responsableId) : null,
      responsable: tarea.responsable?.nombre ?? null,
      oportunidad: tarea.oportunidad ? {
        id: String(tarea.oportunidad.id), titulo: tarea.oportunidad.titulo,
        contacto: tarea.oportunidad.contacto.nombre,
      } : null,
    })),
    truncado: filas.length > 500,
  }, { headers: { "Cache-Control": "no-store" } });
}
