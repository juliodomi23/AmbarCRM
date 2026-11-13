import { NextRequest, NextResponse } from "next/server";
import { requireSesion } from "@/lib/session";
import { transaccionTenant } from "@/lib/retail-db";
import { serializar } from "@/lib/serialize";

export async function GET() {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  if (!sesion.orgId || !sesion.userId) return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });

  const resultado = await transaccionTenant(sesion.orgId, async (tx) => {
    const [notificaciones, noLeidas] = await Promise.all([
      tx.notificacion.findMany({
        where: { usuarioId: sesion.userId! },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      tx.notificacion.count({ where: { usuarioId: sesion.userId!, leidaAt: null } }),
    ]);
    return { notificaciones, noLeidas };
  });
  return NextResponse.json(serializar(resultado));
}

/** Marca todas las notificaciones del usuario como leídas. */
export async function POST(_req: NextRequest) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  if (!sesion.orgId || !sesion.userId) return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });

  await transaccionTenant(sesion.orgId, (tx) =>
    tx.notificacion.updateMany({
      where: { usuarioId: sesion.userId!, leidaAt: null },
      data: { leidaAt: new Date() },
    })
  );
  return NextResponse.json({ ok: true });
}
