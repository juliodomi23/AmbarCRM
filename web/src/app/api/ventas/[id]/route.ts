import { NextRequest, NextResponse } from "next/server";
import { aBigInt } from "@/lib/ids";
import {
  ESTADOS_VENTA,
  type EstadoVenta,
} from "@/lib/retail";
import { ErrorRetail } from "@/lib/retail-db";
import { serializar } from "@/lib/serialize";
import { conModulo } from "@/lib/con-modulo";
import { cambiarEstadoVenta } from "@/lib/venta-estado-db";
import { db } from "@/lib/db";
import { solicitarResena } from "@/lib/resenas-envio";

export const PATCH = conModulo(
  "ventas",
  {},
  async (sesion, req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const id = aBigInt((await params).id);
  if (id === null || sesion.orgId === null) {
    return NextResponse.json({ error: "Venta u organización inválidas" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const estado = String(body.estado ?? "") as EstadoVenta;
  if (!ESTADOS_VENTA.includes(estado)) {
    return NextResponse.json({ error: "El estado no es válido" }, { status: 400 });
  }

  try {
    const previa = estado === "entregada" ? await db.venta.findUnique({ where: { id }, select: { estado: true } }) : null;
    const venta = await cambiarEstadoVenta({ ...sesion, orgId: sesion.orgId }, id, estado);
    if (estado === "entregada" && previa && previa.estado !== "entregada" && venta.contactoId !== null) {
      await solicitarResena(sesion.orgId, { evento: "venta", ventaId: id, contactoId: venta.contactoId });
    }
    return NextResponse.json(serializar({ venta }));
  } catch (error) {
    if (error instanceof ErrorRetail) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
  },
);
