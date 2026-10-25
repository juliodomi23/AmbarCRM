import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { exigirTimbrarCancelar } from "@/lib/cfdi/permisos";
import { crearFactura } from "@/lib/cfdi/servicio";
import { db } from "@/lib/db";
import { paginacionListado } from "@/lib/paginacion";
import { permitido } from "@/lib/rate-limit";
import { serializar } from "@/lib/serialize";

export const POST = conModulo("facturacion", {}, async (sesion, req: NextRequest) => {
  if (sesion.orgId === null) {
    return NextResponse.json({ error: "Organización no disponible" }, { status: 400 });
  }
  if (!permitido(`cfdi:crear:${sesion.orgId}:${sesion.userId ?? "anon"}`, 10, 60_000)) {
    return NextResponse.json({ error: "demasiadas solicitudes de facturación" }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const timbrar = body && typeof body === "object" && "timbrar" in body
    ? (body as { timbrar?: unknown }).timbrar
    : undefined;
  if (timbrar === true || timbrar === "1" || timbrar === "true") exigirTimbrarCancelar(sesion);
  const resultado = await crearFactura(sesion.orgId, body);
  return NextResponse.json(serializar(resultado), { status: resultado.duplicado ? 200 : 201 });
});

export const GET = conModulo("facturacion", {}, async (_sesion, req: NextRequest) => {
  const paginacion = paginacionListado(req);
  const filas = await db.factura.findMany({
    ...paginacion,
    take: paginacion.take + 1,
    orderBy: { id: "desc" },
    select: {
      id: true,
      serie: true,
      folio: true,
      uuid: true,
      estado: true,
      total: true,
      moneda: true,
      usoCfdi: true,
      formaPago: true,
      metodoPago: true,
      createdAt: true,
      timbrandoAt: true,
      timbradaAt: true,
      canceladaAt: true,
      error: true,
      proveedor: true,
      contacto: { select: { id: true, nombre: true } },
      venta: { select: { id: true, folio: true } },
      pago: { select: { id: true, referenciaExterna: true } },
      conceptos: { select: { id: true } },
    },
  });
  const facturas = filas.slice(0, paginacion.take);
  const siguiente = filas.length > paginacion.take ? filas[paginacion.take] : null;
  return NextResponse.json(serializar({
    facturas,
    siguienteCursor: siguiente ? siguiente.id.toString() : null,
  }));
});
