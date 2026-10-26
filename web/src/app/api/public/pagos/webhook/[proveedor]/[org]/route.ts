import { NextRequest, NextResponse } from "next/server";
import { db, runWithOrg } from "@/lib/db";
import { ErrorConfiguracionPagos, obtenerProveedorPago } from "@/lib/pagos/proveedor";
import { ErrorPago, procesarEventoPago } from "@/lib/pagos/servicio";
import { transaccionTenant } from "@/lib/retail-db";

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
      if (!["mercado_pago", "stripe", "mock"].includes(proveedorRuta))
        return NextResponse.json({ error: "proveedor inválido" }, { status: 404 });
      const proveedorConfigurado = await db.credencialPago.findUnique({
        where: { orgId_proveedor: { orgId, proveedor: proveedorRuta } },
        select: { activo: true },
      });
      const mercadoPagoPiloto = proveedorRuta === "mercado_pago"
        && String(orgId) === process.env.PAGOS_ORG_PILOTO?.trim()
        && Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN?.trim());
      if (!proveedorConfigurado?.activo && !mercadoPagoPiloto)
        return NextResponse.json({ error: "proveedor no conectado" }, { status: 404 });
      const proveedor = await obtenerProveedorPago(orgId, proveedorRuta as "mercado_pago" | "stripe" | "mock", { webhook: true });
      const evento = await proveedor.verificarWebhook(req);
      if (!evento) return NextResponse.json({ ok: true, ignorado: true });
      if (evento.cuenta) {
        const credencial = await db.credencialPago.findUnique({ where: { orgId_proveedor: { orgId, proveedor: "stripe" } } });
        if (!credencial?.proveedorUserId || credencial.proveedorUserId !== evento.cuenta.id)
          return NextResponse.json({ error: "cuenta conectada no corresponde a la organización" }, { status: 400 });
        await transaccionTenant(orgId, (tx) => tx.credencialPago.update({
          where: { id: credencial.id },
          data: evento.cuenta?.desautorizada
            ? { activo: true, requiereReconexion: true, stripeChargesEnabled: false }
            : { activo: true, requiereReconexion: false, stripeChargesEnabled: evento.cuenta?.chargesEnabled === true, stripeDetailsSubmitted: evento.cuenta?.detailsSubmitted === true },
        }));
        return NextResponse.json({ ok: true, cuentaActualizada: true });
      }
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
    if (error instanceof Error && error.message === "cuenta conectada no corresponde a la organización")
      return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("[pagos/webhook] evento no procesado", error instanceof Error ? error.message : "error desconocido");
    return NextResponse.json({ error: "no se pudo procesar el evento" }, { status: 500 });
  }
}
