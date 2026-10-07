import { NextRequest, NextResponse } from "next/server";
import { db, runWithOrg } from "@/lib/db";
import { MODULOS, moduloPorClave } from "@/lib/modulos";
import { requireSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await requireSesion();
  if ("error" in s) return s.error;
  const activos = await db.moduloOrg.findMany({ where: { activo: true }, select: { clave: true, config: true } });
  return NextResponse.json({ modulos: MODULOS.map((m) => ({ ...m, activo: activos.some((a) => a.clave === m.clave), config: activos.find((a) => a.clave === m.clave)?.config ?? {} })) });
}

/** El admin de una empresa solo configura módulos que ya estén habilitados. */
export async function PATCH(req: NextRequest) {
  const s = await requireSesion(true);
  if ("error" in s) return s.error;
  const { clave, config } = await req.json().catch(() => ({}));
  if (!moduloPorClave(String(clave)) || !config || typeof config !== "object" || Array.isArray(config)) return NextResponse.json({ error: "configuración inválida" }, { status: 400 });
  const existente = await db.moduloOrg.findFirst({ where: { clave: String(clave), activo: true } });
  if (!existente) return NextResponse.json({ error: "módulo no activo" }, { status: 404 });
  await db.moduloOrg.update({ where: { id: existente.id }, data: { config } });
  return NextResponse.json({ ok: true });
}

/** La organización plataforma habilita o apaga módulos de cualquier cliente. */
export async function POST(req: NextRequest) {
  const s = await requireSesion(true);
  if ("error" in s) return s.error;
  if (s.orgId !== 1n) return NextResponse.json({ error: "solo la plataforma administra módulos" }, { status: 403 });
  const { orgId, clave, activo } = await req.json().catch(() => ({}));
  if (!orgId || !moduloPorClave(String(clave)) || typeof activo !== "boolean") return NextResponse.json({ error: "datos inválidos" }, { status: 400 });
  await runWithOrg(BigInt(orgId), async () => {
    const actual = await db.moduloOrg.findFirst({ where: { clave: String(clave) } });
    if (actual) await db.moduloOrg.update({ where: { id: actual.id }, data: { activo } });
    else await db.moduloOrg.create({ data: { clave: String(clave), activo, config: {} } });
  });
  return NextResponse.json({ ok: true });
}
