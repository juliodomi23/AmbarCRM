import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { calcularCotizacion, configCotizaciones, cotizacionVencida, ZONA_COTIZACIONES, type PartidaCotizacionEntrada } from "@/lib/cotizaciones";
import { dbRaw } from "@/lib/db";
import { bloquearProductos, ErrorRetail, reservasActivasPorProducto, transaccionTenant } from "@/lib/retail-db";
import { fechaLocal } from "@/lib/reservas/horarios";
import { configReservas } from "@/lib/reservas/servidor";
import { calcularPrecios } from "@/lib/precios-db";

export class ErrorCotizacion extends ErrorRetail {}

type DatosCotizacion = {
  contactoId: bigint;
  oportunidadId: bigint | null;
  vigencia: Date;
  descuentoGeneral: Prisma.Decimal;
  convertirVenta: boolean;
  notas: string | null;
  condiciones: string | null;
  partidas: readonly PartidaCotizacionEntrada[];
};

const detalleCotizacion = {
  contacto: true,
  oportunidad: true,
  venta: true,
  creadoPor: { select: { id: true, nombre: true } },
  partidas: { include: { producto: true }, orderBy: { id: "asc" as const } },
};

function folioCotizacion() {
  return `COT-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`;
}

async function prepararPartidas(tx: Prisma.TransactionClient, contactoId: bigint, entradas: readonly PartidaCotizacionEntrada[]) {
  const ids = entradas.flatMap((partida) => partida.productoId === null ? [] : [partida.productoId]);
  const precios = ids.length
    ? await calcularPrecios(tx, entradas.flatMap((partida) => partida.productoId === null ? [] : [{ productoId: partida.productoId, cantidad: partida.cantidad }]), { contactoId })
    : [];
  const porId = new Map(precios.map((precio) => [String(precio.producto.id), precio]));
  return entradas.map((partida) => {
    const calculo = partida.productoId === null ? null : porId.get(String(partida.productoId));
    return {
      productoId: partida.productoId,
      concepto: calculo?.producto.nombre ?? partida.concepto,
      cantidad: partida.cantidad,
      precio: calculo?.precioUnitario ?? partida.precio!,
      descuento: partida.descuento.plus(calculo?.descuentoPromocion ?? 0),
      descuentoPromocion: calculo?.descuentoPromocion ?? new Prisma.Decimal(0),
      promocionDescripcion: calculo?.promocionDescripcion ?? null,
    };
  });
}

export async function crearCotizacion(orgId: bigint, userId: bigint | null, datos: DatosCotizacion) {
  return transaccionTenant(orgId, async (tx) => {
    const contacto = await tx.contacto.findUnique({ where: { id: datos.contactoId } });
    if (!contacto) throw new ErrorCotizacion("El cliente no existe", 404);
    if (datos.oportunidadId !== null) {
      const oportunidad = await tx.oportunidad.findUnique({ where: { id: datos.oportunidadId } });
      if (!oportunidad || oportunidad.contactoId !== contacto.id) throw new ErrorCotizacion("La oportunidad no pertenece al cliente", 404);
    }
    const modulo = await tx.moduloOrg.findFirst({ where: { clave: "cotizaciones", activo: true }, select: { config: true } });
    const config = configCotizaciones(modulo?.config);
    const preparadas = await prepararPartidas(tx, contacto.id, datos.partidas);
    let calculo;
    try {
      calculo = calcularCotizacion(preparadas, datos.descuentoGeneral, config);
    } catch (error) {
      throw new ErrorCotizacion(error instanceof Error ? error.message : "No se pudo calcular la cotización");
    }
    const cotizacion = await tx.cotizacion.create({
      data: {
        folio: folioCotizacion(),
        contactoId: contacto.id,
        oportunidadId: datos.oportunidadId,
        creadoPorId: userId,
        vigencia: datos.vigencia,
        notas: datos.notas,
        condiciones: datos.condiciones,
        subtotal: calculo.subtotal,
        descuento: calculo.descuento,
        impuestos: calculo.impuestos,
        total: calculo.total,
        ivaPorcentaje: config.ivaPorcentaje,
        preciosConIva: config.preciosConIva,
        tokenPublico: randomBytes(16).toString("hex"),
        convertirVenta: datos.convertirVenta,
      },
    });
    await tx.cotizacionPartida.createMany({
      data: calculo.partidas.map((partida) => ({
        cotizacionId: cotizacion.id,
        productoId: partida.productoId,
        concepto: partida.concepto,
        cantidad: partida.cantidad,
        precio: partida.precio,
        descuento: partida.descuento,
        descuentoPromocion: partida.descuentoPromocion,
        promocionDescripcion: partida.promocionDescripcion,
        total: partida.total,
      })),
    });
    return tx.cotizacion.findUniqueOrThrow({ where: { id: cotizacion.id }, include: detalleCotizacion });
  });
}

export function cotizacionInterna(orgId: bigint, id: bigint) {
  return transaccionTenant(orgId, (tx) => tx.cotizacion.findUnique({ where: { id }, include: detalleCotizacion }));
}

async function bloquearCotizacion(tx: Prisma.TransactionClient, token: string) {
  const filas = await tx.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
    SELECT id FROM cotizaciones WHERE token_publico = ${token} FOR UPDATE
  `);
  if (!filas[0]) throw new ErrorCotizacion("Cotización no encontrada", 404);
  return filas[0].id;
}

async function convertirEnVenta(tx: Prisma.TransactionClient, cotizacion: Awaited<ReturnType<typeof cotizacionBloqueada>>) {
  if (cotizacion.ventaId !== null) return cotizacion.ventaId;
  const moduloVentas = await tx.moduloOrg.findFirst({ where: { clave: "ventas", activo: true }, select: { id: true } });
  if (!moduloVentas) throw new ErrorCotizacion("El módulo Ventas no está activo para convertir la cotización", 409);
  if (cotizacion.partidas.some((partida) => partida.productoId === null)) {
    throw new ErrorCotizacion("La cotización tiene conceptos libres y no puede convertirse en venta", 409);
  }
  const productoIds = cotizacion.partidas.map((partida) => partida.productoId!);
  await bloquearProductos(tx, productoIds);
  const productos = await tx.producto.findMany({ where: { id: { in: productoIds }, activo: true } });
  const porId = new Map(productos.map((producto) => [String(producto.id), producto]));
  const reservadas = await reservasActivasPorProducto(tx, productoIds);
  const cantidadesPorProducto = new Map<string, Prisma.Decimal>();
  for (const partida of cotizacion.partidas) {
    const producto = porId.get(String(partida.productoId));
    if (!producto) throw new ErrorCotizacion(`El producto ${partida.concepto} ya no está disponible`, 409);
    const clave = String(producto.id);
    cantidadesPorProducto.set(clave, (cantidadesPorProducto.get(clave) ?? new Prisma.Decimal(0)).plus(partida.cantidad));
  }
  for (const [productoId, cantidadTotal] of cantidadesPorProducto) {
    const producto = porId.get(productoId)!;
    if (producto.stock.minus(reservadas.get(productoId) ?? 0).lt(cantidadTotal)) throw new ErrorCotizacion(`No hay existencias suficientes de ${producto.nombre}`, 409);
  }
  const venta = await tx.venta.create({
    data: {
      folio: `V-COT-${cotizacion.folio}`,
      contactoId: cotizacion.contactoId,
      creadoPorId: cotizacion.creadoPorId,
      estado: "pendiente",
      canal: "cotizacion",
      subtotal: cotizacion.subtotal,
      descuento: cotizacion.descuento,
      total: cotizacion.total,
      notas: `Convertida desde ${cotizacion.folio}`,
      stockAplicado: true,
    },
  });
  for (const partida of cotizacion.partidas) {
    await tx.ventaPartida.create({
      data: {
        ventaId: venta.id,
        productoId: partida.productoId!,
        cantidad: partida.cantidad,
        precioUnitario: partida.precio,
        costoUnitario: porId.get(String(partida.productoId!))!.costo,
        descuento: partida.descuento,
        descuentoPromocion: partida.descuentoPromocion,
        promocionDescripcion: partida.promocionDescripcion,
        total: partida.total,
      },
    });
  }
  for (const [productoId, cantidadTotal] of cantidadesPorProducto) {
    const producto = porId.get(productoId)!;
    const existenciaDespues = producto.stock.minus(cantidadTotal);
    await tx.producto.update({ where: { id: producto.id }, data: { stock: existenciaDespues } });
    await tx.movimientoInventario.create({
      data: {
        productoId: producto.id,
        ventaId: venta.id,
        usuarioId: cotizacion.creadoPorId,
        tipo: "venta",
        cantidad: cantidadTotal.neg(),
        existenciaAntes: producto.stock,
        existenciaDespues,
        motivo: `Venta de cotización ${cotizacion.folio}`,
      },
    });
  }
  return venta.id;
}

async function cotizacionBloqueada(tx: Prisma.TransactionClient, token: string) {
  const id = await bloquearCotizacion(tx, token);
  return tx.cotizacion.findUniqueOrThrow({ where: { id }, include: detalleCotizacion });
}

async function zonaDeEmpresa(tx: Prisma.TransactionClient) {
  const reservas = await tx.moduloOrg.findFirst({ where: { clave: "reservas_en_linea" }, select: { config: true } });
  return reservas ? configReservas(reservas.config).zona : ZONA_COTIZACIONES;
}

export async function responderCotizacion(
  orgId: bigint,
  token: string,
  datos: { accion: "aceptar" | "rechazar"; nombre: string; ip: string; ahora?: Date },
) {
  return transaccionTenant(orgId, async (tx) => {
    const cotizacion = await cotizacionBloqueada(tx, token);
    const estadoDestino = datos.accion === "aceptar" ? "aceptada" : "rechazada";
    if (cotizacion.estado === estadoDestino) return { cotizacion, repetida: true };
    if (["aceptada", "rechazada", "vencida"].includes(cotizacion.estado)) {
      throw new ErrorCotizacion(`La cotización ya está ${cotizacion.estado}`, 409);
    }
    const ahora = datos.ahora ?? new Date();
    const zona = await zonaDeEmpresa(tx);
    if (cotizacionVencida(cotizacion.vigencia, ahora, zona)) {
      throw new ErrorCotizacion("La cotización está vencida", 409);
    }
    let ventaId = cotizacion.ventaId;
    if (datos.accion === "aceptar" && cotizacion.convertirVenta) ventaId = await convertirEnVenta(tx, cotizacion);
    if (datos.accion === "aceptar" && cotizacion.oportunidadId !== null) {
      const oportunidad = await tx.oportunidad.findUnique({ where: { id: cotizacion.oportunidadId } });
      if (oportunidad) {
        const ganada = await tx.etapa.findFirst({ where: { embudoId: oportunidad.embudoId, tipo: "ganado" }, orderBy: { orden: "asc" } });
        if (ganada) {
          await tx.oportunidad.update({ where: { id: oportunidad.id }, data: { etapaId: ganada.id, estado: "ganado", closedAt: ahora } });
          await tx.evento.create({ data: { oportunidadId: oportunidad.id, tipo: "ganada", descripcion: `Cotización ${cotizacion.folio} aceptada` } });
        }
      }
    }
    const actualizada = await tx.cotizacion.update({
      where: { id: cotizacion.id },
      data: {
        estado: estadoDestino,
        ventaId,
        respondidoPor: datos.nombre,
        respondidoAt: ahora,
        respondidoIp: datos.ip,
        version: { increment: 1 },
      },
      include: detalleCotizacion,
    });
    return { cotizacion: actualizada, repetida: false };
  });
}

export async function resolverOrgCotizacion(token: string) {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const filas = await dbRaw.$queryRaw<Array<{ org_id: bigint | null }>>(Prisma.sql`
    SELECT resolve_org_by_cotizacion_token(${token}) AS org_id
  `);
  return filas[0]?.org_id ?? null;
}

export async function cotizacionPublica(orgId: bigint, token: string) {
  return transaccionTenant(orgId, (tx) => tx.cotizacion.findUnique({ where: { tokenPublico: token }, include: detalleCotizacion }));
}

export async function vencerCotizaciones(orgId: bigint, ahora = new Date()) {
  return transaccionTenant(orgId, async (tx) => {
    const zona = await zonaDeEmpresa(tx);
    const hoyLocal = new Date(`${fechaLocal(ahora, zona)}T12:00:00.000Z`);
    const resultado = await tx.cotizacion.updateMany({
      where: { estado: { in: ["borrador", "enviada"] }, vigencia: { lt: hoyLocal } },
      data: { estado: "vencida", version: { increment: 1 } },
    });
    return resultado.count;
  });
}
