import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const s = await requireSesion();
  if ("error" in s) return s.error;
  const entidad = req.nextUrl.searchParams.get("entidad");
  return NextResponse.json({
    campos: await db.campoPersonalizado.findMany({
      where:
        entidad === "contacto" || entidad === "oportunidad" ? { entidad } : {},
      orderBy: { orden: "asc" },
    }),
  });
}
export async function POST(req: NextRequest) {
  const s = await requireSesion(true);
  if ("error" in s) return s.error;
  const b = await req.json().catch(() => ({}));
  if (
    !["contacto", "oportunidad"].includes(b.entidad) ||
    !/^[a-z][a-z0-9_]{1,49}$/.test(b.clave || "") ||
    !["texto", "numero", "fecha", "opcion", "si_no"].includes(b.tipo) ||
    !String(b.etiqueta || "").trim()
  )
    return NextResponse.json({ error: "campo inválido" }, { status: 400 });
  const orden =
    (
      await db.campoPersonalizado.aggregate({
        _max: { orden: true },
        where: { entidad: b.entidad },
      })
    )._max.orden ?? 0;
  const campo = await db.campoPersonalizado.create({
    data: {
      entidad: b.entidad,
      clave: b.clave,
      etiqueta: b.etiqueta.trim(),
      tipo: b.tipo,
      opciones: Array.isArray(b.opciones)
        ? b.opciones.filter((x: unknown) => typeof x === "string")
        : [],
      obligatorio: !!b.obligatorio,
      orden: orden + 1,
    },
  });
  return NextResponse.json({ campo });
}
