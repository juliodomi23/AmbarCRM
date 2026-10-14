import { conModulo } from "@/lib/con-modulo";
import { panelAR } from "@/lib/panel-ar-db";
import { respuestaCSV, toCSV } from "@/lib/csv";

export const GET = conModulo("panel_ar", {}, async (sesion) => {
  const panel = await panelAR(sesion.orgId!);
  const filas = [
    ["MRR hoy", "", "", panel.mrr.toFixed(2)],
    ["MRR proyectado", "", "", panel.mrrProyectado.toFixed(2)],
    ["Vencido", "", "", panel.vencido.toFixed(2)],
    ["Vence en 7 días", "", "", panel.vence7Dias.toFixed(2)],
    ["Vence este mes", "", "", panel.venceMes.toFixed(2)],
    ["Cobrado del mes", "", "", panel.cobradoMes.toFixed(2)],
    ["Incobrables", "", "", panel.incobrable.toFixed(2)],
    ...panel.pipeline.map((fila) => ["Pipeline", fila.etapa, "", fila.valor.toFixed(2)]),
    ...panel.calendario.map((fila) => ["Calendario", fila.contrato.contacto.nombre, fila.vence?.toISOString().slice(0, 10), fila.monto.toFixed(2), fila.estado]),
    ...panel.pagos.map((pago) => ["Pago", pago.contrato.contacto.nombre, pago.pagadoEn?.toISOString(), pago.monto.toFixed(2), pago.comision.pendiente ? "extra: reparto por definir" : pago.concepto, pago.comision.creditoIA.toFixed(2), pago.comision.pendiente ? "" : pago.comision.cto.toFixed(2), pago.comision.pendiente ? "" : pago.comision.ceo.toFixed(2)]),
  ];
  return respuestaCSV(toCSV(["Tipo", "Cliente / etapa", "Fecha", "Monto MXN", "Estado / concepto", "Crédito IA", "CTO", "CEO"], filas), `panel-ar-${panel.mes}.csv`);
});
