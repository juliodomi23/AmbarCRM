import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Crea una oportunidad (tarjeta). Si se manda contacto nuevo, lo crea/reusa por teléfono.
 * Body: { titulo, valor?, embudoId, etapaId, contactoId? , contacto?: {nombre, telefono?} }
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "no autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { titulo, valor = 0, embudoId, etapaId, contactoId, contacto } = body;
  if (!titulo || !embudoId || !etapaId) {
    return NextResponse.json({ error: "faltan campos" }, { status: 400 });
  }

  // Resolver contacto.
  let cId: bigint;
  if (contactoId) {
    cId = BigInt(contactoId);
  } else if (contacto?.telefono) {
    const c =
      (await db.contacto.findFirst({ where: { telefono: contacto.telefono } })) ??
      (await db.contacto.create({
        data: { nombre: contacto.nombre ?? contacto.telefono, telefono: contacto.telefono, fuente: "manual" }
      }));
    cId = c.id;
  } else if (contacto?.nombre) {
    const c = await db.contacto.create({ data: { nombre: contacto.nombre, fuente: "manual" } });
    cId = c.id;
  } else {
    return NextResponse.json({ error: "falta contacto" }, { status: 400 });
  }

  // Posición al final de la etapa.
  const ultima = await db.oportunidad.findFirst({
    where: { etapaId: BigInt(etapaId) },
    orderBy: { orden: "desc" }
  });
  const orden = (ultima?.orden ?? 0) + 10;

  const op = await db.oportunidad.create({
    data: {
      contactoId: cId,
      embudoId: BigInt(embudoId),
      etapaId: BigInt(etapaId),
      titulo,
      valor,
      orden,
      responsableId: session.user.id ? BigInt(session.user.id) : null
    }
  });

  await db.evento.create({
    data: {
      oportunidadId: op.id,
      tipo: "creada",
      descripcion: "Oportunidad creada",
      usuarioId: session.user.id ? BigInt(session.user.id) : null
    }
  });

  return NextResponse.json({ ok: true, id: op.id.toString() });
}
