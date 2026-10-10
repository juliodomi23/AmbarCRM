import { Prisma } from "@prisma/client";
import { validarVentaCaja, type PagoCajaEntrada, type PartidaCajaEntrada } from "@/lib/caja";
import { dinero } from "@/lib/dinero";

export const HORAS_MAXIMAS_SIN_RED = 72;
const TOLERANCIA_RELOJ_MS = 5 * 60_000;
const METODOS_SIN_RED = ["efectivo", "tarjeta", "transferencia"] as const;

export type CodigoSinRed =
  | "SIN_RED_APAGADO"
  | "IDENTIDAD_DISTINTA"
  | "TURNO_REQUERIDO"
  | "VENTA_MUY_ANTIGUA"
  | "FECHA_FUTURA"
  | "FECHA_ANTERIOR_AL_TURNO"
  | "DATOS_INVALIDOS"
  | "TURNO_AJENO"
  | "TURNO_NO_EXISTE"
  | "VENTA_RECHAZADA";

export type VentaSinRedEntrada = {
  orgId: string;
  userId: string;
  turnoId: bigint;
  uuidCliente: string;
  folio: string;
  vendidaAt: Date;
  totalCobrado: Prisma.Decimal;
  descuento: Prisma.Decimal;
  notas: string | null;
  catalogoVersion: string | null;
  partidas: readonly PartidaCajaEntrada[];
  pagos: readonly PagoCajaEntrada[];
};

export function validarVentaSinRed(body: Record<string, unknown>) {
  if (body.contactoId) return { error: "Sin internet solo se venden ventas de mostrador sin cliente" } as const;
  const base = validarVentaCaja({ ...body, contactoId: null });
  if ("error" in base) return { error: String(base.error) } as const;
  if (base.data.pagos.some((pago) => !METODOS_SIN_RED.includes(pago.metodo as (typeof METODOS_SIN_RED)[number]))) {
    return { error: "Sin internet solo se acepta efectivo, tarjeta o transferencia" } as const;
  }
  const vendidaAt = new Date(String(body.vendidaAt ?? ""));
  if (Number.isNaN(vendidaAt.getTime())) return { error: "La fecha de la venta no es válida" } as const;
  const totalTexto = dinero(body.totalCobrado);
  if (totalTexto === null || Number(totalTexto) < 0) return { error: "El total cobrado no es válido" } as const;
  const folio = String(body.folio ?? "");
  if (!/^SR-[0-9A-F]{10}$/.test(folio)) return { error: "El folio de la venta no es válido" } as const;
  if (!/^\d+$/.test(String(body.orgId ?? "")) || !/^\d+$/.test(String(body.userId ?? ""))) {
    return { error: "Falta la identidad de la caja" } as const;
  }
  const catalogoVersion = body.catalogoVersion === undefined || body.catalogoVersion === null ? null : String(body.catalogoVersion).slice(0, 64);
  const datos: VentaSinRedEntrada = {
    orgId: String(body.orgId),
    userId: String(body.userId),
    turnoId: base.data.turnoId,
    uuidCliente: base.data.uuidCliente,
    folio,
    vendidaAt,
    totalCobrado: new Prisma.Decimal(String(totalTexto)),
    descuento: base.data.descuento,
    notas: base.data.notas,
    catalogoVersion,
    partidas: base.data.partidas,
    pagos: base.data.pagos,
  };
  return { data: datos } as const;
}

/** La venta ya ocurrió: no puede ser del futuro ni de hace más de 72 h (se mide siempre contra el instante de subida). */
export function ventanaVentaSinRed(vendidaAt: Date, ahora: Date = new Date()): "FECHA_FUTURA" | "VENTA_MUY_ANTIGUA" | null {
  if (vendidaAt.getTime() > ahora.getTime() + TOLERANCIA_RELOJ_MS) return "FECHA_FUTURA";
  if (vendidaAt.getTime() < ahora.getTime() - HORAS_MAXIMAS_SIN_RED * 3_600_000) return "VENTA_MUY_ANTIGUA";
  return null;
}

export const antesDelTurno = (vendidaAt: Date, abiertoAt: Date) => vendidaAt.getTime() < abiertoAt.getTime() - TOLERANCIA_RELOJ_MS;
export const despuesDelCierre = (vendidaAt: Date, cerradoAt: Date) => vendidaAt.getTime() > cerradoAt.getTime() + TOLERANCIA_RELOJ_MS;
