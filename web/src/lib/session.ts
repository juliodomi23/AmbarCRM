import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

/** Devuelve la sesión o null. */
export function getSesion() {
  return getServerSession(authOptions);
}

/** Para API routes: devuelve { userId, rol } o una respuesta 401/403. */
export async function requireSesion(soloAdmin = false) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { error: NextResponse.json({ error: "no autorizado" }, { status: 401 }) };
  }
  if (soloAdmin && session.user.rol !== "admin") {
    return { error: NextResponse.json({ error: "requiere admin" }, { status: 403 }) };
  }
  const userId = session.user.id ? BigInt(session.user.id) : null;
  const orgId = session.user.orgId ? BigInt(session.user.orgId) : null;
  return { userId, rol: session.user.rol, orgId };
}
