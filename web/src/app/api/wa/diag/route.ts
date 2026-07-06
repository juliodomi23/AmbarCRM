import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db, runWithOrg } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * TEMPORAL — diagnóstico de login por endpoint (BORRAR al resolver el acceso).
 * Replica los 3 pasos del authorize: org por slug → usuario en esa org → bcrypt.
 * Protegido con WA_API_KEY. No revela hashes ni datos sensibles.
 *
 * POST { email, password?, org? }  (org default: "inicial")
 */
export async function POST(req: NextRequest) {
  if (!process.env.WA_API_KEY || req.headers.get("x-api-key") !== process.env.WA_API_KEY) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const email = (body.email ?? "").toString().trim();
  const password = (body.password ?? "").toString();
  const slug = (body.org ?? "inicial").toString().trim().toLowerCase();

  const out: Record<string, unknown> = {};

  const org = await db.org.findUnique({ where: { slug } });
  out.paso1_org = org ? { id: Number(org.id), activo: org.activo } : `NO EXISTE org con slug '${slug}'`;
  if (!org) return NextResponse.json(out);

  if (email) {
    const u = await runWithOrg(org.id, () => db.usuario.findFirst({ where: { email } }));
    out.paso2_usuario = u
      ? { id: Number(u.id), rol: u.rol, activo: u.activo }
      : "NO SE VE (email distinto o usuario en otra org)";
    if (u && password) out.paso3_passwordCoincide = await bcrypt.compare(password, u.passwordHash);
  }

  return NextResponse.json(out);
}
