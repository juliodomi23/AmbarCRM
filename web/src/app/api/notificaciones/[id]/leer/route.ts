import { NextResponse } from "next/server";
import { requireSesion } from "@/lib/session";
import { transaccionTenant } from "@/lib/retail-db";
import { aBigInt } from "@/lib/ids";

type Props = { params: Promise<{ id: string }> };

export async function POST(_req: Request, props: Props) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  if (!sesion.orgId || !sesion.userId) return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });
  const id = aBigInt((await props.params).id);
  if (!id || id <= 0n) return NextResponse.json({ error: "Id inválido" }, { status: 400 });

  await transaccionTenant(sesion.orgId, (tx) =>
    tx.notificacion.updateMany({
      where: { id, usuarioId: sesion.userId!, leidaAt: null },
      data: { leidaAt: new Date() },
    })
  );
  return NextResponse.json({ ok: true });
}
