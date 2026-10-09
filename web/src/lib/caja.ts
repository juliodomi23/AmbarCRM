import { Prisma } from "@prisma/client";
import { cantidad, cantidadValidaParaProducto } from "@/lib/cantidad";
import { dinero } from "@/lib/dinero";

export const METODOS_CAJA = ["efectivo", "tarjeta", "transferencia"] as const;
export const TIPOS_MOVIMIENTO_CAJA = ["entrada", "salida"] as const;
export type MetodoCaja = (typeof METODOS_CAJA)[number];
export type TipoMovimientoCaja = (typeof TIPOS_MOVIMIENTO_CAJA)[number];

export type PartidaCajaEntrada = {
  productoId: bigint;
  cantidad: Prisma.Decimal;
  descuento: Prisma.Decimal;
};

export type PagoCajaEntrada = { metodo: MetodoCaja; monto: Prisma.Decimal };

function decimalDinero(valor: unknown) {
  return dinero(valor) === null ? null : new Prisma.Decimal(String(valor).trim());
}

function id(valor: unknown) {
  const texto = String(valor ?? "");
  return /^\d+$/.test(texto) ? BigInt(texto) : null;
}

function texto(valor: unknown) {
  return String(valor ?? "").trim();
}

export function descuentoMaximoCajero(config: unknown) {
  const valor = Number((config as { descuentoMaximoCajero?: unknown } | null)?.descuentoMaximoCajero ?? 10);
  return Number.isFinite(valor) && valor >= 0 && valor <= 100 ? valor : 10;
}

export function puedeAutorizarDescuento(rol?: string, puesto?: string) {
  return rol === "admin" || puesto?.trim().toLocaleLowerCase("es-MX") === "encargado de tienda";
}

export function puedeCancelarVentaCaja(rol?: string, puesto?: string) {
  return puedeAutorizarDescuento(rol, puesto);
}

export function puedeGestionarTurnos(rol?: string, puesto?: string) {
  return puedeAutorizarDescuento(rol, puesto);
}

export function validarAperturaTurno(body: Record<string, unknown>) {
  const cajaId = id(body.cajaId);
  const fondoInicial = decimalDinero(body.fondoInicial);
  if (cajaId === null) return { error: "Selecciona una caja" } as const;
  if (fondoInicial === null) return { error: "El fondo inicial no es válido" } as const;
  return { data: { cajaId, fondoInicial } } as const;
}

export function validarMovimientoCaja(body: Record<string, unknown>) {
  const turnoId = id(body.turnoId);
  const tipo = String(body.tipo ?? "") as TipoMovimientoCaja;
  const monto = decimalDinero(body.monto);
  const motivo = texto(body.motivo);
  if (turnoId === null) return { error: "El turno no es válido" } as const;
  if (!TIPOS_MOVIMIENTO_CAJA.includes(tipo)) return { error: "El tipo de movimiento no es válido" } as const;
  if (monto === null || monto.lte(0)) return { error: "El monto debe ser mayor a cero" } as const;
  if (!motivo) return { error: "El motivo es obligatorio" } as const;
  return { data: { turnoId, tipo, monto, motivo } } as const;
}

export function validarCierreTurno(body: Record<string, unknown>) {
  const efectivoContado = decimalDinero(body.efectivoContado);
  if (efectivoContado === null) return { error: "El efectivo contado no es válido" } as const;
  return { data: { efectivoContado } } as const;
}

export function validarVentaCaja(body: Record<string, unknown>) {
  const turnoId = id(body.turnoId);
  const contactoId = body.contactoId ? id(body.contactoId) : null;
  const uuidCliente = texto(body.uuidCliente);
  const descuento = decimalDinero(body.descuento ?? 0);
  if (turnoId === null) return { error: "Abre un turno antes de cobrar" } as const;
  if (body.contactoId && contactoId === null) return { error: "El cliente no es válido" } as const;
  if (!uuidCliente || uuidCliente.length > 100) return { error: "La clave de la venta no es válida" } as const;
  if (descuento === null) return { error: "El descuento general no es válido" } as const;
  if (!Array.isArray(body.partidas) || body.partidas.length === 0) return { error: "Agrega al menos un producto" } as const;
  if (!Array.isArray(body.pagos) || body.pagos.length === 0) return { error: "Agrega al menos un pago" } as const;

  const partidas = new Map<string, PartidaCajaEntrada>();
  for (const valor of body.partidas) {
    if (!valor || typeof valor !== "object") return { error: "Hay una partida inválida" } as const;
    const entrada = valor as Record<string, unknown>;
    const productoId = id(entrada.productoId);
    const cantidadPartida = cantidad(entrada.cantidad, new Prisma.Decimal("0.001"));
    const descuentoPartida = decimalDinero(entrada.descuento ?? 0);
    if (productoId === null || cantidadPartida === null || descuentoPartida === null) {
      return { error: "Revisa productos, cantidades y descuentos" } as const;
    }
    const clave = String(productoId);
    const previa = partidas.get(clave);
    partidas.set(clave, {
      productoId,
      cantidad: cantidadPartida.plus(previa?.cantidad ?? 0),
      descuento: descuentoPartida.plus(previa?.descuento ?? 0),
    });
  }

  const pagos = new Map<MetodoCaja, Prisma.Decimal>();
  for (const valor of body.pagos) {
    if (!valor || typeof valor !== "object") return { error: "Hay un pago inválido" } as const;
    const entrada = valor as Record<string, unknown>;
    const metodo = String(entrada.metodo ?? "") as MetodoCaja;
    const monto = decimalDinero(entrada.monto);
    if (!METODOS_CAJA.includes(metodo) || monto === null || monto.lte(0)) {
      return { error: "Revisa los métodos y montos de pago" } as const;
    }
    pagos.set(metodo, monto.plus(pagos.get(metodo) ?? 0));
  }

  return {
    data: {
      turnoId,
      contactoId,
      uuidCliente,
      descuento,
      notas: texto(body.notas) || null,
      partidas: [...partidas.values()],
      pagos: [...pagos].map(([metodo, monto]) => ({ metodo, monto })),
    },
  } as const;
}

export function validarCantidadProducto(cantidadPartida: Prisma.Decimal, vendePorPeso: boolean) {
  return cantidadValidaParaProducto(cantidadPartida, vendePorPeso);
}
