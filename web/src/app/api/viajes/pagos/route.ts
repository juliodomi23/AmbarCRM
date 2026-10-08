import { NextRequest, NextResponse } from "next/server";
import { db, dbRaw } from "@/lib/db";
import { requireModuloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { requireSesion } from "@/lib/session";
import { validarPagoTour } from "@/lib/viajes";

export async function POST(req: NextRequest) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const apagado = await requireModuloActivo("pagos_tours");
  if (apagado) return apagado;
  if (sesion.orgId === null) {
    return NextResponse.json({ error: "Organización no disponible" }, { status: 400 });
  }
  const validacion = validarPagoTour(await req.json().catch(() => ({})));
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  const reserva = await db.reservaTour.findUnique({ where: { id: validacion.data.reservaId } });
  if (!reserva) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  if (validacion.data.monto > Number(reserva.saldo)) {
    return NextResponse.json({ error: "El pago supera el saldo pendiente" }, { status: 400 });
  }
  const pago = await dbRaw.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_org', ${String(sesion.orgId)}, true)`;
    const creado = await tx.pagoTour.create({ data: validacion.data });
    const saldo = Number(reserva.saldo) - validacion.data.monto;
    await tx.reservaTour.update({
      where: { id: reserva.id },
      data: { saldo, estado: saldo === 0 ? "liquidada" : reserva.estado },
    });
    return creado;
  });
  return NextResponse.json(serializar({ pago }), { status: 201 });
}
