import { NextRequest, NextResponse } from "next/server";
import { conModulo, type SesionModulo } from "@/lib/con-modulo";
import { aBigInt } from "@/lib/ids";
import { accesoAgenda } from "@/lib/citas-acceso";
import { conErroresCita, ErrorCita } from "@/lib/citas-servidor";
import { asegurarTokenCita } from "@/lib/citas-token";
import { enlacePublicoGestion } from "@/lib/citas";
import { transaccionTenant } from "@/lib/retail-db";

export const POST = conModulo("citas", {}, conErroresCita(async (sesion: SesionModulo, _req: NextRequest, props: { params: Promise<{ id: string }> }) => {
  const id = aBigInt((await props.params).id);
  if (!id || id > 9223372036854775807n) throw new ErrorCita("Cita inexistente", 404);
  if (!enlacePublicoGestion("")) throw new ErrorCita("Configura la dirección pública del CRM antes de compartir citas", 409);
  const enlace = await transaccionTenant(sesion.orgId!, async (tx) => {
    const acceso = await accesoAgenda(sesion, tx);
    await tx.$queryRaw`SELECT id FROM citas WHERE id = ${id} FOR UPDATE`;
    const cita = await tx.cita.findFirst({ where: { id, AND: acceso.where }, select: { id: true } });
    if (!cita) throw new ErrorCita("Cita inexistente", 404);
    return enlacePublicoGestion((await asegurarTokenCita(tx, id))!);
  });
  return NextResponse.json({ enlace });
}));
