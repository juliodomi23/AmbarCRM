import { Prisma } from "@prisma/client";
import { cantidad } from "@/lib/cantidad";
import { dinero } from "@/lib/dinero";
import { CERO_DECIMAL } from "@/lib/retail";
import { fechaLocal } from "@/lib/reservas/horarios";

export const ESTADOS_COTIZACION = ["borrador", "enviada", "aceptada", "rechazada", "vencida"] as const;
export type EstadoCotizacion = (typeof ESTADOS_COTIZACION)[number];

export type PartidaCotizacionEntrada = {
  productoId: bigint | null;
  concepto: string;
  cantidad: Prisma.Decimal;
  precio: Prisma.Decimal | null;
  descuento: Prisma.Decimal;
};

export type ConfigCotizaciones = {
  ivaPorcentaje: Prisma.Decimal;
  preciosConIva: boolean;
  plantillaCotizacion?: { name: string; language: string };
};

export const ZONA_COTIZACIONES = "America/Mexico_City";

/** La fecha DATE de vigencia es inclusiva durante todo el día local del negocio. */
export function cotizacionVencida(vigencia: Date, ahora: Date, zona = ZONA_COTIZACIONES) {
  return vigencia.toISOString().slice(0, 10) < fechaLocal(ahora, zona);
}

function decimalDinero(valor: unknown) {
  return dinero(valor) === null ? null : new Prisma.Decimal(String(valor).trim());
}

function id(valor: unknown) {
  const texto = String(valor ?? "");
  return /^\d+$/.test(texto) ? BigInt(texto) : null;
}

function texto(valor: unknown, maximo: number) {
  const limpio = String(valor ?? "").trim();
  return limpio && limpio.length <= maximo ? limpio : null;
}

function booleano(valor: unknown) {
  return valor === true || valor === "true" || valor === 1 || valor === "1";
}

export function configCotizaciones(config: unknown): ConfigCotizaciones {
  const valor = config as Record<string, unknown> | null;
  const iva = decimalDinero(valor?.ivaPorcentaje ?? "16");
  const ivaPorcentaje = iva && iva.lte(100) ? iva : new Prisma.Decimal(16);
  const plantilla = valor?.plantillaCotizacion;
  const plantillaCotizacion = plantilla && typeof plantilla === "object"
    ? {
      name: texto((plantilla as Record<string, unknown>).name, 160) ?? "",
      language: texto((plantilla as Record<string, unknown>).language, 20) ?? "",
    }
    : undefined;
  return {
    ivaPorcentaje,
    preciosConIva: booleano(valor?.preciosConIva),
    ...(plantillaCotizacion?.name && plantillaCotizacion.language ? { plantillaCotizacion } : {}),
  };
}

export function validarCotizacion(body: Record<string, unknown>) {
  const contactoId = id(body.contactoId);
  const oportunidadId = body.oportunidadId ? id(body.oportunidadId) : null;
  const descuentoGeneral = decimalDinero(body.descuento ?? 0);
  const vigenciaTexto = String(body.vigencia ?? "");
  const vigencia = /^\d{4}-\d{2}-\d{2}$/.test(vigenciaTexto) ? new Date(`${vigenciaTexto}T12:00:00.000Z`) : null;
  if (contactoId === null) return { error: "Selecciona un cliente" } as const;
  if (body.oportunidadId && oportunidadId === null) return { error: "La oportunidad no es válida" } as const;
  if (!vigencia || Number.isNaN(vigencia.getTime())) return { error: "La vigencia no es válida" } as const;
  if (descuentoGeneral === null) return { error: "El descuento general no es válido" } as const;
  if (!Array.isArray(body.partidas) || body.partidas.length === 0 || body.partidas.length > 100) {
    return { error: "Agrega entre 1 y 100 conceptos" } as const;
  }
  const partidas: PartidaCotizacionEntrada[] = [];
  for (const valor of body.partidas) {
    if (!valor || typeof valor !== "object") return { error: "Hay un concepto inválido" } as const;
    const entrada = valor as Record<string, unknown>;
    const productoId = entrada.productoId ? id(entrada.productoId) : null;
    const concepto = texto(entrada.concepto, 240);
    const cantidadPartida = cantidad(entrada.cantidad, new Prisma.Decimal("0.001"));
    const precio = entrada.productoId ? null : decimalDinero(entrada.precio);
    const descuento = decimalDinero(entrada.descuento ?? 0);
    if (entrada.productoId && productoId === null) return { error: "Un producto no es válido" } as const;
    if (!concepto || cantidadPartida === null || descuento === null || (!productoId && precio === null)) {
      return { error: "Revisa concepto, cantidad, precio y descuento" } as const;
    }
    partidas.push({ productoId, concepto, cantidad: cantidadPartida, precio, descuento });
  }
  const convertirVenta = booleano(body.convertirVenta);
  if (convertirVenta && partidas.some((partida) => partida.productoId === null)) {
    return { error: "Para convertir en venta, todos los conceptos deben usar productos del catálogo" } as const;
  }
  return {
    data: {
      contactoId,
      oportunidadId,
      vigencia,
      descuentoGeneral,
      convertirVenta,
      notas: texto(body.notas, 4000),
      condiciones: texto(body.condiciones, 4000),
      partidas,
    },
  } as const;
}

export function calcularCotizacion(
  partidas: readonly { productoId: bigint | null; concepto: string; cantidad: Prisma.Decimal; precio: Prisma.Decimal; descuento: Prisma.Decimal }[],
  descuentoGeneral: Prisma.Decimal,
  config: ConfigCotizaciones,
) {
  let subtotal = CERO_DECIMAL;
  let descuentoPartidas = CERO_DECIMAL;
  const calculadas = partidas.map((partida) => {
    const bruto = partida.precio.mul(partida.cantidad).toDecimalPlaces(2);
    if (partida.descuento.gt(bruto)) throw new Error("El descuento de un concepto supera su importe");
    subtotal = subtotal.plus(bruto);
    descuentoPartidas = descuentoPartidas.plus(partida.descuento);
    return { ...partida, total: bruto.minus(partida.descuento) };
  });
  const descuento = descuentoPartidas.plus(descuentoGeneral);
  if (descuento.gt(subtotal)) throw new Error("El descuento supera el subtotal");
  const base = subtotal.minus(descuento);
  const tasa = config.ivaPorcentaje.div(100);
  const impuestos = config.preciosConIva
    ? base.minus(base.div(tasa.plus(1))).toDecimalPlaces(2)
    : base.mul(tasa).toDecimalPlaces(2);
  const total = config.preciosConIva ? base : base.plus(impuestos);
  return { partidas: calculadas, subtotal, descuento, impuestos, total };
}

export function validarRespuestaCotizacion(body: Record<string, unknown>) {
  const accion = String(body.accion ?? "");
  const nombre = texto(body.nombre, 160);
  if (accion !== "aceptar" && accion !== "rechazar") return { error: "La respuesta no es válida" } as const;
  if (!nombre) return { error: "Escribe el nombre de quien responde" } as const;
  return { data: { accion: accion as "aceptar" | "rechazar", nombre } } as const;
}
