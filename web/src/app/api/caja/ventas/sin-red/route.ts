import { NextRequest, NextResponse } from "next/server";
import { ventasSinRedActivas } from "@/lib/caja";
import { ErrorCaja } from "@/lib/caja-db";
import { validarVentaSinRed, type CodigoSinRed } from "@/lib/caja-sinred";
import { ErrorSinRed, registrarRechazoSinRed, registrarVentaSinRed } from "@/lib/caja-sinred-db";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const respuestaError = (mensaje: string, codigo: CodigoSinRed, status: number) =>
  NextResponse.json({ error: mensaje, codigo }, { status });

/** Sube una venta cobrada sin internet. Solo si la empresa activó `caja.config.ventasSinRed`. */
export const POST = conModulo("caja", {}, async (sesion, req: NextRequest) => {
  if (sesion.userId === null || sesion.orgId === null) return respuestaError("Sesión incompleta", "DATOS_INVALIDOS", 400);
  const modulo = await db.moduloOrg.findFirst({ where: { clave: "caja", activo: true }, select: { config: true } });
  if (!ventasSinRedActivas(modulo?.config)) {
    return respuestaError("Las ventas sin internet no están activas en esta empresa", "SIN_RED_APAGADO", 403);
  }
  const cuerpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  // Una cola nunca se sube con la sesión de otra persona o empresa: se conserva en el equipo de su dueño.
  if (String(cuerpo.orgId ?? "") !== String(sesion.orgId) || String(cuerpo.userId ?? "") !== String(sesion.userId)) {
    return respuestaError("La venta pertenece a otra sesión", "IDENTIDAD_DISTINTA", 403);
  }
  const identidad = { ...sesion, userId: sesion.userId, orgId: sesion.orgId };
  const uuid = String(cuerpo.uuidCliente ?? "");
  const rechazar = async (codigo: CodigoSinRed, motivo: string, status: number) => {
    if (uuid && uuid.length <= 100) {
      const turno = /^\d+$/.test(String(cuerpo.turnoId ?? "")) ? BigInt(String(cuerpo.turnoId)) : null;
      const fecha = new Date(String(cuerpo.vendidaAt ?? ""));
      await registrarRechazoSinRed(identidad, {
        uuidCliente: uuid, turnoId: turno, vendidaAt: Number.isNaN(fecha.getTime()) ? null : fecha,
        codigo, motivo, payload: JSON.parse(JSON.stringify(cuerpo)),
      });
    }
    return respuestaError(motivo, codigo, status);
  };

  const validacion = validarVentaSinRed(cuerpo);
  if ("error" in validacion) return rechazar("DATOS_INVALIDOS", String(validacion.error), 400);
  try {
    const resultado = await registrarVentaSinRed(identidad, validacion.data);
    return NextResponse.json(serializar(resultado), { status: resultado.repetida ? 200 : 201 });
  } catch (error) {
    if (error instanceof ErrorSinRed) {
      return error.registrar && error.status < 500
        ? rechazar(error.codigo, error.message, error.status)
        : respuestaError(error.message, error.codigo, error.status);
    }
    if (error instanceof ErrorCaja || (error instanceof Error && "status" in error && Number((error as { status: unknown }).status) < 500)) {
      return rechazar("VENTA_RECHAZADA", error.message, Number((error as { status?: number }).status ?? 400));
    }
    throw error;
  }
});
