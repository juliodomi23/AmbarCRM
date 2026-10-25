import { NextRequest, NextResponse } from "next/server";
import { db, runWithOrg } from "@/lib/db";
import { ErrorConfiguracionPagos, obtenerProveedorPago } from "@/lib/pagos/proveedor";
import { ErrorPago, procesarEventoPago } from "@/lib/pagos/servicio";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ proveedor: string; org: string }> },
) {
  const { proveedor: proveedorRuta, org: orgTexto } = await params;
  if (!/^\d+$/.test(orgTexto))
    return NextResponse.json({ error: "organización inválida" }, { status: 400 });
  const orgId = BigInt(orgTexto);
  try {
    return await runWithOrg(orgId, async () => {
      const modulo = await db.moduloOrg.findFirst({
        where: { clave: "pagos_en_linea", activo: true },
        select: { id: true },
      });
      if (!modulo) return NextResponse.json({ error: "módulo no activo" }, { status: 404 });
      const proveedor = await obtenerProveedorPago(orgId);
      if (proveedor.clave !== proveedorRuta)
        return NextResponse.json({ error: "proveedor inválido" }, { status: 404 });
      const evento = await proveedor.verificarWebhook(req);
      if (!evento) return NextResponse.json({ ok: true, ignorado: true });
      const resultado = await procesarEventoPago(orgId, proveedor.clave, evento);
      return NextResponse.json({
        ok: true,
        duplicado: resultado.duplicado,
        rechazado: "rechazado" in resultado ? resultado.rechazado : false,
      });
    });
  } catch (error) {
    if (error instanceof ErrorPago || error instanceof ErrorConfiguracionPagos)
      return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.message === "firma de webhook inválida")
      return NextResponse.json({ error: error.message }, { status: 401 });
    console.error("[pagos/webhook] evento no procesado", error instanceof Error ? error.message : "error desconocido");
    return NextResponse.json({ error: "no se pudo procesar el evento" }, { status: 500 });
  }
}
