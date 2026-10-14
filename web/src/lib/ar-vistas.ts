import { Prisma } from "@prisma/client";

export const ESTILOS_AR = {
  produccion: { titulo: "Producción", badge: "!bg-emerald-50 !text-emerald-800 dark:!bg-emerald-950 dark:!text-emerald-200", borde: "!border-l-emerald-600" },
  en_desarrollo: { titulo: "En desarrollo", badge: "!bg-amber-50 !text-amber-900 dark:!bg-amber-950 dark:!text-amber-200", borde: "!border-l-amber-600" },
  en_pruebas: { titulo: "En pruebas", badge: "!bg-blue-50 !text-blue-800 dark:!bg-blue-950 dark:!text-blue-200", borde: "!border-l-blue-600" },
  pausado: { titulo: "Pausado", badge: "!bg-slate-100 !text-slate-700 dark:!bg-slate-800 dark:!text-slate-200", borde: "!border-l-slate-400" },
  baja: { titulo: "Baja", badge: "!bg-red-50 !text-red-800 dark:!bg-red-950 dark:!text-red-200", borde: "!border-l-red-400" },
  incobrable: { titulo: "Incobrable", badge: "!bg-red-100 !text-red-950 dark:!bg-red-950 dark:!text-red-200", borde: "!border-l-red-800" },
  pagado: { titulo: "Pagado", badge: "!bg-emerald-50 !text-emerald-800 dark:!bg-emerald-950 dark:!text-emerald-200", borde: "!border-l-emerald-600" },
  pendiente: { titulo: "Pendiente", badge: "!bg-slate-100 !text-slate-700 dark:!bg-slate-800 dark:!text-slate-200", borde: "!border-l-slate-300" },
  vencido: { titulo: "Vencido", badge: "!bg-red-50 !text-red-800 dark:!bg-red-950 dark:!text-red-200", borde: "!border-l-red-600" },
  cancelado: { titulo: "Cancelado", badge: "!bg-slate-100 !text-slate-700 !line-through dark:!bg-slate-800 dark:!text-slate-200", borde: "!border-l-slate-300" },
  por_confirmar: { titulo: "Por confirmar", badge: "!bg-slate-100 !text-slate-700 dark:!bg-slate-800 dark:!text-slate-200", borde: "!border-l-slate-300" },
} as const;

export const ESTADOS_OCULTOS_AR = ["baja", "incobrable"];
export function contratoVisible(estado: string | null, bajas = false) {
  return bajas || !ESTADOS_OCULTOS_AR.includes(estado ?? "");
}
export function filtroContratosAR(bajas = false, q = ""): Prisma.ContratoWhereInput {
  return { AND: [
    bajas ? {} : { OR: [{ estado: null }, { estado: { notIn: ESTADOS_OCULTOS_AR } }] },
    q ? { OR: [{ contacto: { nombre: { contains: q, mode: "insensitive" } } }, { tipo: { contains: q.replaceAll(" ","_"), mode: "insensitive" } }] } : {},
  ] };
}
export function estiloAR(estado: string | null) {
  return ESTILOS_AR[estado as keyof typeof ESTILOS_AR] ?? ESTILOS_AR.por_confirmar;
}
export function saldoCobro(cobro: { monto: Prisma.Decimal; montoPagado?: Prisma.Decimal; estado: string }) {
  return ["pagado", "cancelado"].includes(cobro.estado) ? new Prisma.Decimal(0) : cobro.monto.minus(cobro.montoPagado ?? 0);
}
export function grupoCobro(cobro: { estado: string; vence: Date | null }, hoy: Date) {
  if (cobro.estado === "pagado") return "Pagados";
  if (["incobrable", "cancelado"].includes(cobro.estado)) return "Historial";
  if (cobro.vence && cobro.vence < hoy) return "Vencidos";
  if (cobro.vence && cobro.vence.getTime() <= hoy.getTime() + 7 * 86400000) return "Esta semana";
  if (cobro.vence && cobro.vence.getUTCMonth() === hoy.getUTCMonth() && cobro.vence.getUTCFullYear() === hoy.getUTCFullYear()) return "Este mes";
  return "Después";
}

export type AbonoAR = { clave: string; monto: string; pagadoEn: string; metodo: string; referencia: string | null };
export function abonosCobro(cobro: { id: bigint; monto: Prisma.Decimal; estado: string; pagadoEn: Date | null; pagos: unknown }) {
  if (cobro.estado === "cancelado") return [];
  const pagos = (Array.isArray(cobro.pagos) ? cobro.pagos : []) as AbonoAR[];
  if (pagos.length) return pagos.map((pago) => ({ id: `${cobro.id}:${pago.clave}`, monto: new Prisma.Decimal(pago.monto), pagadoEn: new Date(pago.pagadoEn) }));
  return cobro.estado === "pagado" && cobro.pagadoEn ? [{ id: String(cobro.id), monto: cobro.monto, pagadoEn: cobro.pagadoEn }] : [];
}
