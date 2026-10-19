import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conModulo } from "@/lib/con-modulo";
import { serializar } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export const GET = conModulo("citas", {}, async (_sesion, req: NextRequest) => {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length > 100) return NextResponse.json({ error: "La búsqueda admite hasta 100 caracteres" }, { status: 400 });
  const telefono = q.replace(/\D/g, "");
  const contactos = await db.contacto.findMany({
    where: q ? { OR: [
      { nombre: { contains: q, mode: "insensitive" } },
      ...(telefono.length >= 3 ? [{ telefono: { contains: telefono } }] : []),
    ] } : {},
    select: { id: true, nombre: true, telefono: true, expediente: { select: { id: true } } },
    orderBy: [{ nombre: "asc" }, { id: "asc" }],
    take: 31,
  });
  return NextResponse.json(serializar({ contactos: contactos.slice(0, 30), hayMas: contactos.length > 30 }));
});
