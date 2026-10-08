import { NextRequest, NextResponse } from "next/server";
import { db, dbRaw } from "@/lib/db";
import { conModulo } from "@/lib/con-modulo";
import { ErrorAurum, moduloLealtad, verificarCredenciales } from "@/lib/aurum";
import { slugValido } from "@/lib/lealtad";
import { encryptMetaToken } from "@/lib/meta/credentials";

export const dynamic = "force-dynamic";

/** Conecta el negocio de Aurum con la clave del dueño. Body: { slug, clave } */
export const POST = conModulo("lealtad", { admin: true }, async (sesion, req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const slug = slugValido(body.slug);
  const clave = String(body.clave ?? "");
  if (!slug || !clave) {
    return NextResponse.json({ error: "Escribe el identificador del negocio y la clave" }, { status: 400 });
  }
  const [dueno] = await dbRaw.$queryRaw<{ org_id: bigint | null }[]>`
    SELECT resolve_org_by_aurum_slug(${slug}) AS org_id`;
  if (dueno?.org_id && dueno.org_id !== sesion.orgId) {
    return NextResponse.json({ error: "Ese negocio de Aurum ya está conectado a otra empresa" }, { status: 409 });
  }
  try {
    const error = await verificarCredenciales(slug, clave);
    if (error) return NextResponse.json({ error }, { status: 400 });
  } catch (error) {
    if (error instanceof ErrorAurum) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  const modulo = await moduloLealtad();
  if (!modulo) return NextResponse.json({ error: "módulo no activo" }, { status: 404 });
  await db.moduloOrg.update({
    where: { id: modulo.id },
    data: {
      config: {
        ...(modulo.config as Record<string, unknown>),
        aurum: { slug, claveCifrada: encryptMetaToken(clave), estado: "ok" },
      },
    },
  });
  return NextResponse.json({ ok: true, slug });
});

export const DELETE = conModulo("lealtad", { admin: true }, async () => {
  const modulo = await moduloLealtad();
  if (!modulo) return NextResponse.json({ error: "módulo no activo" }, { status: 404 });
  const { aurum: _quitado, ...resto } = modulo.config as Record<string, unknown>;
  await db.moduloOrg.update({ where: { id: modulo.id }, data: { config: resto as object } });
  return NextResponse.json({ ok: true });
});
