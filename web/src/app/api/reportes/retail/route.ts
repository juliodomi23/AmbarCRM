import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { respuestaCSV, toCSV } from "@/lib/csv";
import { reporteRetail } from "@/lib/reportes-retail-db";
import { ErrorReporteRetail, puedeVerReportesRetail } from "@/lib/reportes-retail";
import { serializar } from "@/lib/serialize";

export const GET = conModulo("caja", {}, async (sesion, req: NextRequest) => {
  if (sesion.orgId === null || !puedeVerReportesRetail(sesion.rol, sesion.puesto)) {
    return NextResponse.json({ error: "Reporte no encontrado" }, { status: 404 });
  }
  const url = new URL(req.url);
  const desde = url.searchParams.get("desde") ?? "";
  const hasta = url.searchParams.get("hasta") ?? "";
  const pagina = Number(url.searchParams.get("pagina") ?? 1);
  const tamano = Number(url.searchParams.get("tamano") ?? 50);
  let reporte: Awaited<ReturnType<typeof reporteRetail>>;
  try {
    reporte = await reporteRetail(sesion.orgId, { desde, hasta, pagina, tamano });
  } catch (error) {
    if (error instanceof ErrorReporteRetail) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  if (url.searchParams.get("formato") !== "csv") return NextResponse.json(serializar({ reporte }));
  const filas: (string | number | null | undefined)[][] = [];
  const agregar = (seccion: string, datos: Array<{ nombre: string; cantidad?: unknown; ingresos?: unknown; costos?: unknown; utilidad?: unknown; ingresosSinCosto?: unknown }>) => {
    for (const fila of datos) filas.push([seccion, fila.nombre, String(fila.cantidad ?? ""), String(fila.ingresos ?? ""), String(fila.costos ?? ""), String(fila.utilidad ?? ""), String(fila.ingresosSinCosto ?? "")]);
  };
  agregar("Producto/variante", reporte.productos.variantes);
  agregar("Producto padre", reporte.productos.agrupados);
  agregar("Categoría", reporte.categorias);
  agregar("Día", reporte.ventas.porDia);
  agregar("Hora", reporte.ventas.porHora);
  agregar("Cajero", reporte.ventas.porCajero);
  agregar("Caja", reporte.ventas.porCaja);
  filas.push(["Envíos", "Envíos cobrados", "", String(reporte.envios), "", "", ""]);
  for (const fila of reporte.cortes) filas.push(["Diferencia de corte", fila.nombre, fila.turnos, "", "", String(fila.diferencia), `Por ventas tardías ${fila.explicadoPorTardias} · ajustada ${fila.diferenciaAjustada}`]);
  for (const fila of reporte.inventario.filas) filas.push(["Inventario", fila.nombre, String(fila.stock), String(fila.valorPrecio), String(fila.valorCosto), "", fila.negativo ? "Existencia negativa" : fila.sinMovimiento ? "Sin movimiento" : fila.alertaMinimo ? "Bajo mínimo" : ""]);
  return respuestaCSV(toCSV(["seccion", "nombre", "cantidad", "ingresos_o_valor", "costos", "utilidad_o_diferencia", "sin_costo_o_alerta"], filas), `reporte_retail_${desde}_${hasta}.csv`);
});
