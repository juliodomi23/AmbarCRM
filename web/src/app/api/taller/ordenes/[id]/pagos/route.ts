import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { transaccionTenant } from "@/lib/retail-db";
import { aBigInt } from "@/lib/ids";

const metodos = ["efectivo", "tarjeta", "transferencia", "otro"];
export const GET = conModulo("taller", {}, async (_sesion, _req: NextRequest, props: { params: Promise<{ id: string }> }) => {
  const id = aBigInt((await props.params).id);
  if (!id || id <= 0n) return NextResponse.json({ error: "Orden inválida" }, { status: 400 });
  const [orden, pagos] = await Promise.all([db.tallerOrden.findUnique({ where: { id }, select: { total: true } }), db.tallerPago.findMany({ where: { ordenId: id }, orderBy: { createdAt: "asc" } })]);
  if (!orden) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
  const pagado = pagos.reduce((sum, p) => sum.plus(p.monto), new Prisma.Decimal(0));
  return NextResponse.json({ pagos, total: orden.total, pagado, saldo: Prisma.Decimal.max(new Prisma.Decimal(0), new Prisma.Decimal(orden.total).minus(pagado)) });
});
export const POST = conModulo("taller", {}, async (sesion, req: NextRequest, props: { params: Promise<{ id: string }> }) => {
  if (sesion.userId === null) return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });
  const userId = sesion.userId;
  const id = aBigInt((await props.params).id), body = await req.json().catch(() => null), monto = Number(body?.monto), metodo = String(body?.metodo ?? "");
  if (!id || id <= 0n || !/^\d+(?:\.\d{1,2})?$/.test(String(body?.monto ?? "")) || !Number.isFinite(monto) || monto <= 0 || monto > 100000000 || !metodos.includes(metodo)) return NextResponse.json({ error: "Monto o método de pago inválido" }, { status: 400 });
  const result = await transaccionTenant(sesion.orgId!, async (tx) => {
    const [orden] = await tx.$queryRaw<{ id: bigint; estado: string; total: Prisma.Decimal }[]>`SELECT id, estado, total FROM taller_ordenes WHERE id = ${id} FOR UPDATE`;
    if (!orden) return { error: "Orden no encontrada", status: 404 } as const;
    if (["cancelado", "entregado"].includes(orden.estado)) return { error: "No se puede registrar pago en una orden cerrada", status: 409 } as const;
    const agregado = await tx.tallerPago.aggregate({ where: { ordenId: id }, _sum: { monto: true } });
    const saldo = new Prisma.Decimal(orden.total).minus(agregado._sum.monto ?? 0);
    const pago = new Prisma.Decimal(monto).toDecimalPlaces(2);
    if (pago.greaterThan(saldo)) return { error: "El pago supera el saldo pendiente", status: 409 } as const;
    const nuevo = await tx.tallerPago.create({ data: { ordenId: id, monto: pago, metodo, userId } });
    return { pago: nuevo, saldo: saldo.minus(pago) } as const;
  });
  return "error" in result ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json(result, { status: 201 });
});
