import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { validarCampos } from "@/lib/campos-personalizados";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const s = await requireSesion();
  if ("error" in s) return s.error;

  const {
    nombre,
    telefono,
    email,
    empresa,
    fuente,
    responsableId,
    notas,
    campos,
  } = await req.json().catch(() => ({}));
  if (!nombre)
    return NextResponse.json({ error: "falta nombre" }, { status: 400 });

  const definiciones = await db.campoPersonalizado.findMany({
    where: { entidad: "contacto" },
  });
  const resultado = validarCampos(definiciones as any, campos);
  if (resultado.errores.length) {
    return NextResponse.json(
      { error: resultado.errores.join(", ") },
      { status: 400 },
    );
  }

  const c = await db.contacto.create({
    data: {
      nombre,
      telefono: telefono || null,
      email: email || null,
      empresa: empresa || null,
      fuente: fuente || "manual",
      notas: notas || null,
      responsableId: responsableId ? BigInt(responsableId) : null,
      campos: resultado.campos,
    },
  });
  return NextResponse.json({ ok: true, id: c.id.toString() });
}
