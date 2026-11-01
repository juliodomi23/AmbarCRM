import { NextRequest } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { respuestaCSV, toCSV } from "@/lib/csv";
import { periodoReporte, reportesTaller } from "@/lib/taller-reportes";
import { textoEstadoTaller } from "@/lib/taller-mensajes";

export const dynamic = "force-dynamic";

/**
 * GET /api/taller/reportes?desde=YYYY-MM-DD&hasta=YYYY-MM-DD[&formato=csv]
 * Solo administradores. Sin `formato` responde el JSON del reporte; con
 * `formato=csv` descarga las órdenes del periodo (UTF-8 con BOM).
 */
export const GET = conModulo("taller", { admin: true }, async (_sesion, req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const { desde, hasta } = periodoReporte(searchParams.get("desde"), searchParams.get("hasta"));
  const reporte = await reportesTaller(desde, hasta);
  if (searchParams.get("formato") !== "csv") {
    return Response.json(reporte, { headers: { "Cache-Control": "no-store" } });
  }
  const csv = toCSV(
    ["Folio", "Fecha", "Cliente", "Vehículo", "Placa", "Estado", "Total", "Pagado", "Saldo", "Mecánico"],
    reporte.ordenes.map((orden) => [
      orden.numero,
      orden.fecha,
      orden.cliente,
      orden.vehiculo,
      orden.placa,
      textoEstadoTaller(orden.estado),
      orden.total.toFixed(2),
      orden.pagado.toFixed(2),
      orden.saldo.toFixed(2),
      orden.mecanico,
    ]),
  );
  return respuestaCSV(csv, `taller-${desde}-a-${hasta}.csv`);
});
