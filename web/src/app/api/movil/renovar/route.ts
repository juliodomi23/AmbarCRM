import { getToken } from "next-auth/jwt";
import { NextRequest } from "next/server";
import { db, runWithOrg } from "@/lib/db";
import { noAutorizadoMovil, respuestaTokenMovil } from "@/lib/auth-movil";
import { sesionAnteriorAlCambio } from "@/lib/password-sesion";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const token = await getToken({ req });
  if (!token?.id || !token.orgId || token.revocado) return noAutorizadoMovil();
  let orgId: bigint;
  let userId: bigint;
  try { orgId = BigInt(token.orgId); userId = BigInt(token.id); }
  catch { return noAutorizadoMovil(); }
  const [usuario, org] = await Promise.all([
    runWithOrg(orgId, () => db.usuario.findUnique({ where: { id: userId } })),
    db.org.findUnique({ where: { id: orgId }, select: { slug: true, nombre: true, activo: true } })
  ]);
  if (!usuario?.activo || !org?.activo || sesionAnteriorAlCambio(token, usuario.passwordCambiadaAt)) return noAutorizadoMovil();
  return respuestaTokenMovil({ id: String(usuario.id), name: usuario.nombre, email: usuario.email,
    rol: usuario.rol, orgId: String(orgId), puesto: usuario.puesto }, org,
  token.emitidoAt ?? (token.iat ? token.iat * 1000 : 0));
}
