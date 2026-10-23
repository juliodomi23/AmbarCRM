import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { paginacionListado } from "@/lib/paginacion";
import { requireSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;

  const { take } = paginacionListado(req);
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 100);
  const cursorTexto = req.nextUrl.searchParams.get("cursor");
  const cursorId = cursorTexto ? aBigInt(cursorTexto) : null;
  if (cursorTexto && !cursorId) return NextResponse.json({ error: "cursor inválido" }, { status: 400 });

  const cursor = cursorId ? await db.contacto.findUnique({
    where: { id: cursorId }, select: { id: true, createdAt: true },
  }) : null;
  if (cursorId && !cursor) return NextResponse.json({ error: "cursor inválido" }, { status: 400 });

  const filtros: Prisma.ContactoWhereInput[] = [];
  if (q.length >= 2) filtros.push({ OR: [
    { nombre: { contains: q, mode: "insensitive" } },
    { telefono: { contains: q, mode: "insensitive" } },
    { email: { contains: q, mode: "insensitive" } },
    { empresa: { contains: q, mode: "insensitive" } },
  ] });
  if (cursor) filtros.push({ OR: [
    { createdAt: { lt: cursor.createdAt } },
    { createdAt: cursor.createdAt, id: { lt: cursor.id } },
  ] });

  const filas = await db.contacto.findMany({
    where: filtros.length ? { AND: filtros } : undefined,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    select: {
      id: true, nombre: true, telefono: true, email: true, empresa: true,
      fuente: true, responsableId: true, optOutDifusion: true, campos: true,
      responsable: { select: { nombre: true } },
      expediente: { select: { id: true } },
      _count: { select: { oportunidades: true } },
      etiquetas: { select: { etiqueta: { select: { id: true, nombre: true, color: true } } } },
    },
  });
  const visibles = filas.slice(0, take);
  return NextResponse.json({
    contactos: visibles.map((contacto) => ({
      id: String(contacto.id), nombre: contacto.nombre, telefono: contacto.telefono,
      email: contacto.email, empresa: contacto.empresa, fuente: contacto.fuente,
      responsableId: contacto.responsableId ? String(contacto.responsableId) : null,
      responsable: contacto.responsable?.nombre ?? null,
      optOutDifusion: contacto.optOutDifusion,
      oportunidades: contacto._count.oportunidades,
      esCliente: Boolean(contacto.expediente), campos: contacto.campos,
      etiquetas: contacto.etiquetas.map(({ etiqueta }) => ({
        id: String(etiqueta.id), nombre: etiqueta.nombre, color: etiqueta.color,
      })),
    })),
    siguiente: filas.length > take ? String(visibles.at(-1)!.id) : null,
  }, { headers: { "Cache-Control": "no-store" } });
}
