import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { validarCampos } from "@/lib/campos-personalizados";
import { referenciaPropia } from "@/lib/referencias";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  const s = await requireSesion();
  if ("error" in s) return s.error;

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  for (const campo of [
    "nombre",
    "telefono",
    "email",
    "empresa",
    "fuente",
    "notas",
  ]) {
    if (campo in body) data[campo] = body[campo] || null;
  }
  if ("responsableId" in body) {
    const responsableId = await referenciaPropia("usuario", body.responsableId);
    if (responsableId === false)
      return NextResponse.json({ error: "responsable inexistente" }, { status: 400 });
    data.responsableId = responsableId;
  }
  if (typeof body.esPersonal === "boolean") data.esPersonal = body.esPersonal;
  if (typeof body.optOutDifusion === "boolean")
    data.optOutDifusion = body.optOutDifusion;
  if ("campos" in body) {
    const defs = await db.campoPersonalizado.findMany({
      where: { entidad: "contacto" },
    });
    const resultado = validarCampos(defs as any, body.campos);
    if (resultado.errores.length)
      return NextResponse.json(
        { error: resultado.errores.join(", ") },
        { status: 400 },
      );
    data.campos = resultado.campos;
  }

  await db.contacto.update({ where: { id: BigInt(params.id) }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const params = await props.params;
  const s = await requireSesion();
  if ("error" in s) return s.error;

  await db.contacto.delete({ where: { id: BigInt(params.id) } });
  return NextResponse.json({ ok: true });
}
