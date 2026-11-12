import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { transaccionTenant } from "@/lib/retail-db";
import { aBigInt } from "@/lib/ids";
import { aFecha, exigirGestion, fechaCivil, texto } from "@/lib/despacho-api";

type Props = { params: Promise<{ id: string }> };

function montoDecimal(valor: unknown) {
  const crudo = typeof valor === "string" || typeof valor === "number" ? String(valor).trim() : "";
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(crudo)) return null;
  const monto = new Prisma.Decimal(crudo);
  return monto.gt(0) ? monto : null;
}

export const POST = conModulo("despacho", {}, async (sesion, req: NextRequest, props: Props) => {
  const bloqueo = exigirGestion(sesion);
  if (bloqueo) return bloqueo;
  const id = aBigInt((await props.params).id);
  const body = await req.json().catch(() => null);
  const monto = montoDecimal(body?.monto);
  const fecha = fechaCivil(body?.fecha);
  const metodo = texto(body?.metodo).slice(0, 80) || null;
  const nota = texto(body?.nota).slice(0, 500) || null;
  if (!id || id <= 0n || !monto || !fecha) return NextResponse.json({ error: "Importe y fecha de pago válidos son obligatorios" }, { status: 400 });
  if (!sesion.orgId || !sesion.userId) return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });

  const resultado = await transaccionTenant(sesion.orgId, async (tx) => {
    await tx.$queryRaw<Array<{ id: bigint }>>`
      SELECT id FROM despacho_movimientos_financieros
      WHERE id = ${id} AND org_id = ${sesion.orgId}
      FOR UPDATE
    `;
    const movimiento = await tx.despachoMovimientoFinanciero.findUnique({ where: { id } });
    if (!movimiento) return { error: "Cuenta por cobrar no encontrada", status: 404 } as const;
    if (movimiento.tipo !== "ingreso") return { error: "Solo se registran abonos sobre ingresos por cobrar", status: 400 } as const;
    const pagos = await tx.despachoFinanzaPago.aggregate({ where: { movimientoId: id }, _sum: { monto: true } });
    const pagado = pagos._sum.monto ?? new Prisma.Decimal(0);
    const saldo = movimiento.monto.minus(pagado);
    if (monto.gt(saldo)) return { error: `El abono supera el saldo pendiente de $${saldo.toFixed(2)}`, status: 400 } as const;
    const pago = await tx.despachoFinanzaPago.create({ data: { movimientoId: id, monto, fecha: aFecha(fecha), responsableId: sesion.userId!, metodo, nota } });
    return {
      pago,
      movimiento: await tx.despachoMovimientoFinanciero.findUnique({
        where: { id },
        include: { cliente: { include: { contacto: { select: { nombre: true, empresa: true } } } }, pagos: { orderBy: [{ fecha: "desc" }, { id: "desc" }] } },
      }),
    } as const;
  });
  if ("error" in resultado) return NextResponse.json({ error: resultado.error }, { status: resultado.status });
  return NextResponse.json(serializar(resultado));
});
