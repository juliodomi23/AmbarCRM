import { NextRequest, NextResponse } from "next/server";
import { ErrorCupo, registrarPagoTourConSaldo } from "@/lib/cupos-db";
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
  try {
    const pago = await registrarPagoTourConSaldo(sesion.orgId, validacion.data);
    return NextResponse.json(serializar({ pago }), { status: 201 });
  } catch (error) {
    if (error instanceof ErrorCupo) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
