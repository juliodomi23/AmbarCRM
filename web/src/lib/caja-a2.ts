import { Prisma } from "@prisma/client";
import { cantidad } from "@/lib/cantidad";
import { dinero } from "@/lib/dinero";

export const TIPOS_REEMBOLSO = ["efectivo", "nota_credito"] as const;
export const FORMAS_CANCELACION_APARTADO = ["sin_reembolso", "efectivo", "nota_credito"] as const;
export const METODOS_ABONO = ["efectivo", "tarjeta", "transferencia"] as const;
export type TipoReembolso = (typeof TIPOS_REEMBOLSO)[number];
export type FormaCancelacionApartado = (typeof FORMAS_CANCELACION_APARTADO)[number];
export type MetodoAbono = (typeof METODOS_ABONO)[number];

export type PartidaNueva = { productoId: bigint; cantidad: Prisma.Decimal; descuento: Prisma.Decimal };
export type PartidaDevolucionEntrada = { ventaPartidaId: bigint; cantidad: Prisma.Decimal };

function id(valor: unknown) {
  const texto = String(valor ?? "");
  return /^\d+$/.test(texto) ? BigInt(texto) : null;
}

function decimalDinero(valor: unknown) {
  return dinero(valor) === null ? null : new Prisma.Decimal(String(valor).trim());
}

function texto(valor: unknown) {
  return String(valor ?? "").trim();
}

function partidasNuevas(valor: unknown) {
  if (!Array.isArray(valor) || valor.length === 0) return null;
  const acumuladas = new Map<string, PartidaNueva>();
  for (const item of valor) {
    if (!item || typeof item !== "object") return null;
    const entrada = item as Record<string, unknown>;
    const productoId = id(entrada.productoId);
    const cantidadPartida = cantidad(entrada.cantidad, new Prisma.Decimal("0.001"));
    const descuento = decimalDinero(entrada.descuento ?? 0);
    if (productoId === null || cantidadPartida === null || descuento === null) return null;
    const clave = String(productoId);
    const previa = acumuladas.get(clave);
    acumuladas.set(clave, {
      productoId,
      cantidad: cantidadPartida.plus(previa?.cantidad ?? 0),
      descuento: descuento.plus(previa?.descuento ?? 0),
    });
  }
  return [...acumuladas.values()];
}

export function validarDevolucion(body: Record<string, unknown>) {
  const ventaId = id(body.ventaId);
  const ventaCambioId = body.ventaCambioId ? id(body.ventaCambioId) : null;
  const tipoReembolso = String(body.tipoReembolso ?? "") as TipoReembolso;
  if (ventaId === null) return { error: "La venta original no es válida" } as const;
  if (body.ventaCambioId && ventaCambioId === null) return { error: "La venta de cambio no es válida" } as const;
  if (!TIPOS_REEMBOLSO.includes(tipoReembolso)) return { error: "El reembolso no es válido" } as const;
  if (!Array.isArray(body.partidas) || body.partidas.length === 0) return { error: "Selecciona partidas para devolver" } as const;
  const acumuladas = new Map<string, PartidaDevolucionEntrada>();
  for (const item of body.partidas) {
    if (!item || typeof item !== "object") return { error: "Hay una partida inválida" } as const;
    const entrada = item as Record<string, unknown>;
    const ventaPartidaId = id(entrada.ventaPartidaId);
    const cantidadDevuelta = cantidad(entrada.cantidad, new Prisma.Decimal("0.001"));
    if (ventaPartidaId === null || cantidadDevuelta === null) return { error: "Revisa las cantidades a devolver" } as const;
    const clave = String(ventaPartidaId);
    acumuladas.set(clave, {
      ventaPartidaId,
      cantidad: cantidadDevuelta.plus(acumuladas.get(clave)?.cantidad ?? 0),
    });
  }
  return { data: { ventaId, ventaCambioId, tipoReembolso, motivo: texto(body.motivo) || null, partidas: [...acumuladas.values()] } } as const;
}

export function validarApartado(body: Record<string, unknown>) {
  const turnoId = id(body.turnoId);
  const contactoId = id(body.contactoId);
  const anticipo = decimalDinero(body.anticipo);
  const metodo = String(body.metodo ?? "") as MetodoAbono;
  const partidas = partidasNuevas(body.partidas);
  const uuidCliente = texto(body.uuidCliente);
  if (turnoId === null) return { error: "Abre un turno antes de apartar" } as const;
  if (contactoId === null) return { error: "Selecciona el cliente del apartado" } as const;
  if (anticipo === null || anticipo.lte(0)) return { error: "El anticipo debe ser mayor a cero" } as const;
  if (!METODOS_ABONO.includes(metodo)) return { error: "El método del anticipo no es válido" } as const;
  if (!partidas) return { error: "Agrega productos al apartado" } as const;
  if (!uuidCliente || uuidCliente.length > 100) return { error: "La clave del apartado no es válida" } as const;
  return { data: { turnoId, contactoId, anticipo, metodo, partidas, uuidCliente, notas: texto(body.notas) || null } } as const;
}

export function validarAbonoApartado(body: Record<string, unknown>) {
  const turnoId = id(body.turnoId);
  const monto = decimalDinero(body.monto);
  const metodo = String(body.metodo ?? "") as MetodoAbono;
  if (turnoId === null) return { error: "El turno no es válido" } as const;
  if (monto === null || monto.lte(0)) return { error: "El abono debe ser mayor a cero" } as const;
  if (!METODOS_ABONO.includes(metodo)) return { error: "El método de abono no es válido" } as const;
  return { data: { turnoId, monto, metodo } } as const;
}

export function validarCancelacionApartado(body: Record<string, unknown>) {
  const forma = String(body.forma ?? "sin_reembolso") as FormaCancelacionApartado;
  if (!FORMAS_CANCELACION_APARTADO.includes(forma)) return { error: "La forma de cancelación no es válida" } as const;
  return { data: { forma } } as const;
}

export function validarVentaCredito(body: Record<string, unknown>) {
  const turnoId = id(body.turnoId);
  const contactoId = id(body.contactoId);
  const descuento = decimalDinero(body.descuento ?? 0);
  const partidas = partidasNuevas(body.partidas);
  const uuidCliente = texto(body.uuidCliente);
  if (turnoId === null) return { error: "Abre un turno antes de vender" } as const;
  if (contactoId === null) return { error: "Selecciona el cliente del crédito" } as const;
  if (descuento === null) return { error: "El descuento no es válido" } as const;
  if (!partidas) return { error: "Agrega productos a la venta" } as const;
  if (!uuidCliente || uuidCliente.length > 100) return { error: "La clave de la venta no es válida" } as const;
  return { data: { turnoId, contactoId, descuento, partidas, uuidCliente, notas: texto(body.notas) || null } } as const;
}

export function validarLimiteCredito(body: Record<string, unknown>) {
  const limiteCredito = decimalDinero(body.limiteCredito);
  if (limiteCredito === null) return { error: "El límite de crédito no es válido" } as const;
  return { data: { limiteCredito } } as const;
}

export function validarAbonoCredito(body: Record<string, unknown>) {
  const turnoId = id(body.turnoId);
  const contactoId = id(body.contactoId);
  const monto = decimalDinero(body.monto);
  const metodo = String(body.metodo ?? "") as MetodoAbono;
  if (turnoId === null || contactoId === null) return { error: "Turno o cliente inválidos" } as const;
  if (monto === null || monto.lte(0)) return { error: "El abono debe ser mayor a cero" } as const;
  if (!METODOS_ABONO.includes(metodo)) return { error: "El método de abono no es válido" } as const;
  return { data: { turnoId, contactoId, monto, metodo } } as const;
}
