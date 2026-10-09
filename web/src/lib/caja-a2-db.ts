import { Prisma } from "@prisma/client";
import {
  type FormaCancelacionApartado,
  type MetodoAbono,
  type PartidaDevolucionEntrada,
  type PartidaNueva,
  type TipoReembolso,
} from "@/lib/caja-a2";
import { descuentoMaximoCajero, puedeAutorizarDescuento } from "@/lib/caja";
import { bloquearTurnoCaja, type IdentidadCaja } from "@/lib/caja-db";
import { cantidadValidaParaProducto } from "@/lib/cantidad";
import { CERO_DECIMAL, importePartida } from "@/lib/retail";
import { bloquearProductos, bloquearVenta, ErrorRetail, transaccionTenant } from "@/lib/retail-db";

export class ErrorCajaA2 extends ErrorRetail {}

type DatosVentaNueva = {
  turnoId: bigint;
  contactoId: bigint;
  uuidCliente: string;
  partidas: readonly PartidaNueva[];
  notas: string | null;
};

type IdentidadVencimiento = Omit<IdentidadCaja, "userId"> & { userId: bigint | null };

async function turnoAbiertoPropio(tx: Prisma.TransactionClient, sesion: IdentidadCaja, turnoId: bigint) {
  await bloquearTurnoCaja(tx, turnoId);
  const turno = await tx.turnoCaja.findUnique({ where: { id: turnoId } });
  if (!turno || turno.estado !== "abierto") throw new ErrorCajaA2("Abre un turno antes de continuar", 409);
  if (turno.usuarioId !== sesion.userId) throw new ErrorCajaA2("El turno pertenece a otra persona", 403);
  return turno;
}

async function bloquearApartado(tx: Prisma.TransactionClient, apartadoId: bigint) {
  await tx.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
    SELECT id FROM apartados WHERE id = ${apartadoId} FOR UPDATE
  `);
}

async function bloquearCuenta(tx: Prisma.TransactionClient, cuentaId: bigint) {
  await tx.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
    SELECT id FROM cuentas_cliente WHERE id = ${cuentaId} FOR UPDATE
  `);
}

async function prepararPartidas(
  tx: Prisma.TransactionClient,
  partidas: readonly PartidaNueva[],
) {
  await bloquearProductos(tx, partidas.map((partida) => partida.productoId));
  const productos = await tx.producto.findMany({
    where: { id: { in: partidas.map((partida) => partida.productoId) }, activo: true },
  });
  if (productos.length !== partidas.length) throw new ErrorCajaA2("Uno de los productos no existe o está inactivo", 404);
  const porId = new Map(productos.map((producto) => [String(producto.id), producto]));
  let subtotal = CERO_DECIMAL;
  let descuentosPartidas = CERO_DECIMAL;
  for (const partida of partidas) {
    const producto = porId.get(String(partida.productoId));
    if (!producto) throw new ErrorCajaA2("Producto no encontrado", 404);
    if (!cantidadValidaParaProducto(partida.cantidad, producto.vendePorPeso)) {
      throw new ErrorCajaA2(`${producto.nombre} se vende por piezas enteras`);
    }
    if (producto.stock.lt(partida.cantidad)) throw new ErrorCajaA2(`No hay existencias suficientes de ${producto.nombre}`, 409);
    const bruto = importePartida(producto.precio, partida.cantidad);
    if (partida.descuento.gt(bruto)) throw new ErrorCajaA2(`El descuento de ${producto.nombre} supera su importe`);
    subtotal = subtotal.plus(bruto);
    descuentosPartidas = descuentosPartidas.plus(partida.descuento);
  }
  return { porId, subtotal, descuentosPartidas };
}

async function guardarPartidasYDescontar(
  tx: Prisma.TransactionClient,
  ventaId: bigint,
  folio: string,
  usuarioId: bigint,
  partidas: readonly PartidaNueva[],
  porId: Awaited<ReturnType<typeof prepararPartidas>>["porId"],
) {
  for (const partida of partidas) {
    const producto = porId.get(String(partida.productoId))!;
    const bruto = importePartida(producto.precio, partida.cantidad);
    const existenciaDespues = producto.stock.minus(partida.cantidad);
    await tx.ventaPartida.create({
      data: {
        ventaId,
        productoId: producto.id,
        cantidad: partida.cantidad,
        precioUnitario: producto.precio,
        descuento: partida.descuento,
        total: bruto.minus(partida.descuento),
      },
    });
    await tx.producto.update({ where: { id: producto.id }, data: { stock: existenciaDespues } });
    await tx.movimientoInventario.create({
      data: {
        productoId: producto.id,
        ventaId,
        usuarioId,
        tipo: "venta",
        cantidad: partida.cantidad.neg(),
        existenciaAntes: producto.stock,
        existenciaDespues,
        motivo: `Venta ${folio}`,
      },
    });
  }
}

export async function registrarDevolucion(
  sesion: IdentidadCaja,
  datos: {
    ventaId: bigint;
    ventaCambioId: bigint | null;
    tipoReembolso: TipoReembolso;
    motivo: string | null;
    partidas: readonly PartidaDevolucionEntrada[];
  },
) {
  return transaccionTenant(sesion.orgId, async (tx) => {
    let turnoActual: Awaited<ReturnType<typeof tx.turnoCaja.findFirst>> = null;
    if (datos.tipoReembolso === "efectivo") {
      const turnoId = (await tx.turnoCaja.findFirst({
        where: { usuarioId: sesion.userId, estado: "abierto" },
        select: { id: true },
      }))?.id;
      if (!turnoId) throw new ErrorCajaA2("Abre tu turno para devolver efectivo", 409);
      await bloquearTurnoCaja(tx, turnoId);
      turnoActual = await tx.turnoCaja.findUnique({ where: { id: turnoId } });
      if (!turnoActual || turnoActual.estado !== "abierto") throw new ErrorCajaA2("Abre tu turno para devolver efectivo", 409);
    }

    await bloquearVenta(tx, datos.ventaId);
    const venta = await tx.venta.findUnique({
      where: { id: datos.ventaId },
      include: { partidas: { include: { producto: true } } },
    });
    if (!venta || venta.estado === "cancelada" || venta.estado === "apartado") {
      throw new ErrorCajaA2("La venta no admite devoluciones", 409);
    }
    if (datos.tipoReembolso === "nota_credito" && venta.contactoId === null) {
      throw new ErrorCajaA2("La nota de crédito requiere que la venta tenga cliente", 409);
    }
    if (datos.ventaCambioId !== null) {
      if (datos.ventaCambioId === venta.id) throw new ErrorCajaA2("La venta de cambio debe ser distinta");
      const cambio = await tx.venta.findUnique({ where: { id: datos.ventaCambioId }, select: { id: true } });
      if (!cambio) throw new ErrorCajaA2("La venta de cambio no existe", 404);
    }

    const idsSolicitados = new Set(datos.partidas.map((partida) => String(partida.ventaPartidaId)));
    const partidasVenta = venta.partidas.filter((partida) => idsSolicitados.has(String(partida.id)));
    if (partidasVenta.length !== datos.partidas.length) throw new ErrorCajaA2("Una partida no pertenece a la venta", 404);
    const anteriores = await tx.devolucionPartida.findMany({
      where: { ventaPartidaId: { in: venta.partidas.map((partida) => partida.id) } },
      select: { ventaPartidaId: true, cantidad: true, monto: true },
    });
    const devueltoPorPartida = new Map<string, { cantidad: Prisma.Decimal; monto: Prisma.Decimal }>();
    for (const anterior of anteriores) {
      const clave = String(anterior.ventaPartidaId);
      const previo = devueltoPorPartida.get(clave);
      devueltoPorPartida.set(clave, {
        cantidad: anterior.cantidad.plus(previo?.cantidad ?? 0),
        monto: anterior.monto.plus(previo?.monto ?? 0),
      });
    }

    const partidasOrdenadas = [...venta.partidas].sort((a, b) => (a.id < b.id ? -1 : 1));
    const baseTrasDescuentosPartida = partidasOrdenadas.reduce((suma, partida) => suma.plus(partida.total), CERO_DECIMAL);
    if (baseTrasDescuentosPartida.lte(0)) throw new ErrorCajaA2("La venta no tiene un importe reembolsable", 409);
    const montoTotalPorPartida = new Map<string, Prisma.Decimal>();
    let asignado = CERO_DECIMAL;
    for (const [indice, partida] of partidasOrdenadas.entries()) {
      const monto = indice === partidasOrdenadas.length - 1
        ? venta.total.minus(asignado)
        : partida.total.mul(venta.total).div(baseTrasDescuentosPartida).toDecimalPlaces(2);
      montoTotalPorPartida.set(String(partida.id), monto);
      asignado = asignado.plus(monto);
    }

    const calculadas = datos.partidas.map((solicitada) => {
      const partida = partidasVenta.find((item) => item.id === solicitada.ventaPartidaId)!;
      const devuelto = devueltoPorPartida.get(String(partida.id));
      const cantidadAnterior = devuelto?.cantidad ?? CERO_DECIMAL;
      const montoAnterior = devuelto?.monto ?? CERO_DECIMAL;
      const disponible = partida.cantidad.minus(cantidadAnterior);
      if (solicitada.cantidad.gt(disponible)) {
        throw new ErrorCajaA2(`Solo quedan ${disponible.toString()} por devolver de ${partida.producto.nombre}`, 409);
      }
      const cantidadAcumulada = cantidadAnterior.plus(solicitada.cantidad);
      const montoAcumulado = montoTotalPorPartida.get(String(partida.id))!
        .mul(cantidadAcumulada)
        .div(partida.cantidad)
        .toDecimalPlaces(2);
      const monto = montoAcumulado.minus(montoAnterior);
      if (monto.lte(0)) throw new ErrorCajaA2("No se puede reembolsar una partida sin importe");
      return { partida, cantidad: solicitada.cantidad, monto };
    });
    const total = calculadas.reduce((suma, partida) => suma.plus(partida.monto), CERO_DECIMAL);
    const totalDevueltoAntes = anteriores.reduce((suma, partida) => suma.plus(partida.monto), CERO_DECIMAL);
    if (totalDevueltoAntes.plus(total).gt(venta.total)) {
      throw new ErrorCajaA2("La devolución supera el total cobrado en la venta", 409);
    }

    await bloquearProductos(tx, calculadas.map(({ partida }) => partida.productoId));
    const devolucion = await tx.devolucionVenta.create({
      data: {
        ventaOriginalId: venta.id,
        ventaCambioId: datos.ventaCambioId,
        turnoId: turnoActual?.id ?? null,
        usuarioId: sesion.userId,
        tipoReembolso: datos.tipoReembolso,
        total,
        motivo: datos.motivo,
      },
    });
    for (const calculada of calculadas) {
      const producto = await tx.producto.findUniqueOrThrow({ where: { id: calculada.partida.productoId } });
      const existenciaDespues = producto.stock.plus(calculada.cantidad);
      await tx.devolucionPartida.create({
        data: { devolucionId: devolucion.id, ventaPartidaId: calculada.partida.id, cantidad: calculada.cantidad, monto: calculada.monto },
      });
      await tx.producto.update({ where: { id: producto.id }, data: { stock: existenciaDespues } });
      await tx.movimientoInventario.create({
        data: {
          productoId: producto.id,
          ventaId: venta.id,
          usuarioId: sesion.userId,
          tipo: "devolucion",
          cantidad: calculada.cantidad,
          existenciaAntes: producto.stock,
          existenciaDespues,
          motivo: `Devolución de ${venta.folio}`,
        },
      });
    }
    if (datos.tipoReembolso === "efectivo") {
      await tx.movimientoCaja.create({
        data: { turnoId: turnoActual!.id, tipo: "salida", monto: total, motivo: `Devolución ${venta.folio}`, usuarioId: sesion.userId },
      });
    } else {
      await tx.notaCreditoCliente.create({
        data: { contactoId: venta.contactoId!, devolucionId: devolucion.id, montoOriginal: total, saldo: total },
      });
    }
    return tx.devolucionVenta.findUniqueOrThrow({
      where: { id: devolucion.id },
      include: { partidas: { include: { ventaPartida: { include: { producto: true } } } }, notaCredito: true, ventaCambio: true },
    });
  });
}

export async function crearApartado(
  sesion: IdentidadCaja,
  datos: DatosVentaNueva & { anticipo: Prisma.Decimal; metodo: MetodoAbono },
) {
  return transaccionTenant(sesion.orgId, async (tx) => {
    const turno = await turnoAbiertoPropio(tx, sesion, datos.turnoId);
    const contacto = await tx.contacto.findUnique({ where: { id: datos.contactoId } });
    if (!contacto) throw new ErrorCajaA2("El cliente no existe", 404);
    const existente = await tx.venta.findFirst({ where: { uuidCliente: datos.uuidCliente }, include: { apartado: true } });
    if (existente?.apartado) return { apartado: existente.apartado, repetido: true };
    const { porId, subtotal, descuentosPartidas } = await prepararPartidas(tx, datos.partidas);
    const total = subtotal.minus(descuentosPartidas);
    if (datos.anticipo.gt(total)) throw new ErrorCajaA2("El anticipo no puede superar el total");
    const saldo = total.minus(datos.anticipo);
    const modulo = await tx.moduloOrg.findFirst({ where: { clave: "caja", activo: true }, select: { config: true } });
    const diasConfigurados = Number((modulo?.config as { apartadoDiasVigencia?: unknown } | null)?.apartadoDiasVigencia ?? 7);
    const dias = Number.isInteger(diasConfigurados) && diasConfigurados >= 1 && diasConfigurados <= 365 ? diasConfigurados : 7;
    const venta = await tx.venta.create({
      data: {
        folio: `A-${Date.now().toString(36).toUpperCase()}-${datos.uuidCliente.slice(-6).toUpperCase()}`,
        turnoId: turno.id,
        cajaId: turno.cajaId,
        uuidCliente: datos.uuidCliente,
        contactoId: contacto.id,
        creadoPorId: sesion.userId,
        estado: saldo.isZero() ? "pagada" : "apartado",
        canal: "mostrador",
        metodoPago: datos.metodo,
        subtotal,
        descuento: descuentosPartidas,
        total,
        notas: datos.notas,
        stockAplicado: true,
      },
    });
    await tx.pagoVenta.create({ data: { ventaId: venta.id, metodo: datos.metodo, monto: datos.anticipo } });
    await guardarPartidasYDescontar(tx, venta.id, venta.folio, sesion.userId, datos.partidas, porId);
    const apartado = await tx.apartado.create({
      data: {
        ventaId: venta.id,
        contactoId: contacto.id,
        usuarioId: sesion.userId,
        estado: saldo.isZero() ? "liquidado" : "activo",
        anticipo: datos.anticipo,
        saldo,
        venceAt: new Date(Date.now() + dias * 86_400_000),
        liquidadoAt: saldo.isZero() ? new Date() : null,
      },
    });
    await tx.abonoApartado.create({
      data: { apartadoId: apartado.id, turnoId: turno.id, usuarioId: sesion.userId, metodo: datos.metodo, monto: datos.anticipo },
    });
    return { apartado, repetido: false };
  });
}

export async function abonarApartado(
  sesion: IdentidadCaja,
  apartadoId: bigint,
  datos: { turnoId: bigint; monto: Prisma.Decimal; metodo: MetodoAbono },
) {
  return transaccionTenant(sesion.orgId, async (tx) => {
    const turno = await turnoAbiertoPropio(tx, sesion, datos.turnoId);
    await bloquearApartado(tx, apartadoId);
    const apartado = await tx.apartado.findUnique({ where: { id: apartadoId } });
    if (!apartado || apartado.estado !== "activo") throw new ErrorCajaA2("El apartado no está activo", 409);
    if (datos.monto.gt(apartado.saldo)) throw new ErrorCajaA2("El abono supera el saldo pendiente");
    const saldo = apartado.saldo.minus(datos.monto);
    await tx.abonoApartado.create({
      data: { apartadoId, turnoId: turno.id, usuarioId: sesion.userId, metodo: datos.metodo, monto: datos.monto },
    });
    if (datos.metodo === "efectivo") {
      await tx.movimientoCaja.create({
        data: { turnoId: turno.id, usuarioId: sesion.userId, tipo: "entrada", monto: datos.monto, motivo: `Abono apartado ${apartado.id}` },
      });
    }
    const actualizado = await tx.apartado.update({
      where: { id: apartadoId },
      data: { saldo, estado: saldo.isZero() ? "liquidado" : "activo", liquidadoAt: saldo.isZero() ? new Date() : null },
    });
    if (saldo.isZero()) await tx.venta.update({ where: { id: apartado.ventaId }, data: { estado: "pagada" } });
    return actualizado;
  });
}

async function cancelarApartadoTx(
  tx: Prisma.TransactionClient,
  sesion: IdentidadVencimiento,
  apartadoId: bigint,
  forma: FormaCancelacionApartado,
  estado: "cancelado" | "vencido",
) {
  let turnoActual: Awaited<ReturnType<typeof tx.turnoCaja.findFirst>> = null;
  if (forma === "efectivo") {
    if (sesion.userId === null) throw new ErrorCajaA2("El reembolso en efectivo requiere una persona", 409);
    const encontrado = await tx.turnoCaja.findFirst({ where: { usuarioId: sesion.userId, estado: "abierto" }, select: { id: true } });
    if (!encontrado) throw new ErrorCajaA2("Abre tu turno para reembolsar el apartado", 409);
    await bloquearTurnoCaja(tx, encontrado.id);
    turnoActual = await tx.turnoCaja.findUnique({ where: { id: encontrado.id } });
    if (!turnoActual || turnoActual.estado !== "abierto") throw new ErrorCajaA2("Abre tu turno para reembolsar el apartado", 409);
  }
  await bloquearApartado(tx, apartadoId);
  const apartado = await tx.apartado.findUnique({ where: { id: apartadoId }, include: { venta: { include: { partidas: true } } } });
  if (!apartado || apartado.estado !== "activo") throw new ErrorCajaA2("El apartado no está activo", 409);
  await bloquearVenta(tx, apartado.ventaId);
  await bloquearProductos(tx, apartado.venta.partidas.map((partida) => partida.productoId));
  for (const partida of apartado.venta.partidas) {
    const producto = await tx.producto.findUniqueOrThrow({ where: { id: partida.productoId } });
    const existenciaDespues = producto.stock.plus(partida.cantidad);
    await tx.producto.update({ where: { id: producto.id }, data: { stock: existenciaDespues } });
    await tx.movimientoInventario.create({
      data: {
        productoId: producto.id,
        ventaId: apartado.ventaId,
        usuarioId: sesion.userId,
        tipo: "devolucion",
        cantidad: partida.cantidad,
        existenciaAntes: producto.stock,
        existenciaDespues,
        motivo: `${estado === "vencido" ? "Vencimiento" : "Cancelación"} de apartado`,
      },
    });
  }
  const pagado = apartado.venta.total.minus(apartado.saldo);
  if (forma === "efectivo" && pagado.gt(0)) {
    await tx.movimientoCaja.create({
      data: { turnoId: turnoActual!.id, usuarioId: sesion.userId, tipo: "salida", monto: pagado, motivo: `Reembolso apartado ${apartado.id}` },
    });
  }
  if (forma === "nota_credito" && pagado.gt(0)) {
    await tx.notaCreditoCliente.create({
      data: { contactoId: apartado.contactoId, apartadoId: apartado.id, montoOriginal: pagado, saldo: pagado },
    });
  }
  await tx.venta.update({ where: { id: apartado.ventaId }, data: { estado: "cancelada", stockAplicado: false } });
  return tx.apartado.update({
    where: { id: apartado.id },
    data: { estado, canceladoAt: new Date() },
  });
}

export function cancelarApartado(
  sesion: IdentidadCaja,
  apartadoId: bigint,
  forma: FormaCancelacionApartado,
) {
  return transaccionTenant(sesion.orgId, (tx) => cancelarApartadoTx(tx, sesion, apartadoId, forma, "cancelado"));
}

export async function vencerApartados(sesion: IdentidadVencimiento, ahora = new Date()) {
  const ids = await transaccionTenant(sesion.orgId, async (tx) => (
    await tx.apartado.findMany({ where: { estado: "activo", venceAt: { lte: ahora } }, select: { id: true }, take: 100 })
  ).map((apartado) => apartado.id));
  let vencidos = 0;
  for (const id of ids) {
    try {
      await transaccionTenant(sesion.orgId, (tx) => cancelarApartadoTx(tx, sesion, id, "sin_reembolso", "vencido"));
      vencidos += 1;
    } catch (error) {
      if (!(error instanceof ErrorCajaA2) || error.status !== 409) throw error;
    }
  }
  return vencidos;
}

export async function configurarLimiteCredito(
  sesion: IdentidadCaja,
  contactoId: bigint,
  limiteCredito: Prisma.Decimal,
) {
  if (!puedeAutorizarDescuento(sesion.rol, sesion.puesto)) {
    throw new ErrorCajaA2("Configurar crédito requiere Encargado de tienda o Admin", 403);
  }
  return transaccionTenant(sesion.orgId, async (tx) => {
    if (!(await tx.contacto.findUnique({ where: { id: contactoId } }))) throw new ErrorCajaA2("El cliente no existe", 404);
    return tx.cuentaCliente.upsert({
      where: { contactoId },
      create: { contactoId, limiteCredito },
      update: { limiteCredito },
      include: { contacto: true },
    });
  });
}

export async function registrarVentaCredito(
  sesion: IdentidadCaja,
  datos: DatosVentaNueva & { descuento: Prisma.Decimal },
) {
  return transaccionTenant(sesion.orgId, async (tx) => {
    const turno = await turnoAbiertoPropio(tx, sesion, datos.turnoId);
    const repetida = await tx.venta.findFirst({ where: { uuidCliente: datos.uuidCliente }, include: { contacto: true, partidas: true } });
    if (repetida) return { venta: repetida, repetida: true };
    const cuentaInicial = await tx.cuentaCliente.findUnique({ where: { contactoId: datos.contactoId } });
    if (!cuentaInicial) throw new ErrorCajaA2("Configura el límite de crédito del cliente", 409);
    await bloquearCuenta(tx, cuentaInicial.id);
    const cuenta = await tx.cuentaCliente.findUniqueOrThrow({ where: { id: cuentaInicial.id } });
    const { porId, subtotal, descuentosPartidas } = await prepararPartidas(tx, datos.partidas);
    const base = subtotal.minus(descuentosPartidas);
    if (datos.descuento.gt(base)) throw new ErrorCajaA2("El descuento general supera el subtotal");
    const descuentoTotal = descuentosPartidas.plus(datos.descuento);
    const total = subtotal.minus(descuentoTotal);
    const modulo = await tx.moduloOrg.findFirst({ where: { clave: "caja", activo: true }, select: { config: true } });
    const porcentaje = subtotal.isZero() ? CERO_DECIMAL : descuentoTotal.mul(100).div(subtotal);
    const maximo = descuentoMaximoCajero(modulo?.config);
    if (!puedeAutorizarDescuento(sesion.rol, sesion.puesto) && porcentaje.gt(maximo)) {
      throw new ErrorCajaA2(`El descuento supera el ${maximo}% permitido para Cajero`, 403);
    }
    const saldoDespues = cuenta.saldo.plus(total);
    if (saldoDespues.gt(cuenta.limiteCredito) && !puedeAutorizarDescuento(sesion.rol, sesion.puesto)) {
      throw new ErrorCajaA2("La venta rebasa el límite de crédito; requiere Encargado de tienda o Admin", 403);
    }
    const venta = await tx.venta.create({
      data: {
        folio: `CR-${Date.now().toString(36).toUpperCase()}-${datos.uuidCliente.slice(-6).toUpperCase()}`,
        turnoId: turno.id,
        cajaId: turno.cajaId,
        uuidCliente: datos.uuidCliente,
        contactoId: datos.contactoId,
        creadoPorId: sesion.userId,
        estado: "pendiente",
        canal: "mostrador",
        metodoPago: "credito",
        subtotal,
        descuento: descuentoTotal,
        total,
        notas: datos.notas,
        stockAplicado: true,
        esCredito: true,
      },
    });
    await guardarPartidasYDescontar(tx, venta.id, venta.folio, sesion.userId, datos.partidas, porId);
    await tx.cuentaCliente.update({ where: { id: cuenta.id }, data: { saldo: saldoDespues } });
    await tx.movimientoCuentaCliente.create({
      data: {
        cuentaId: cuenta.id,
        ventaId: venta.id,
        turnoId: turno.id,
        usuarioId: sesion.userId,
        tipo: "cargo",
        monto: total,
        saldoAntes: cuenta.saldo,
        saldoDespues,
        referencia: venta.folio,
      },
    });
    return { venta: await tx.venta.findUniqueOrThrow({ where: { id: venta.id }, include: { contacto: true, partidas: true } }), repetida: false };
  });
}

export async function registrarAbonoCredito(
  sesion: IdentidadCaja,
  datos: { turnoId: bigint; contactoId: bigint; monto: Prisma.Decimal; metodo: MetodoAbono },
) {
  return transaccionTenant(sesion.orgId, async (tx) => {
    const turno = await turnoAbiertoPropio(tx, sesion, datos.turnoId);
    const cuentaInicial = await tx.cuentaCliente.findUnique({ where: { contactoId: datos.contactoId } });
    if (!cuentaInicial) throw new ErrorCajaA2("El cliente no tiene cuenta de crédito", 404);
    await bloquearCuenta(tx, cuentaInicial.id);
    const cuenta = await tx.cuentaCliente.findUniqueOrThrow({ where: { id: cuentaInicial.id } });
    if (datos.monto.gt(cuenta.saldo)) throw new ErrorCajaA2("El abono supera el saldo del cliente");
    const saldoDespues = cuenta.saldo.minus(datos.monto);
    await tx.cuentaCliente.update({ where: { id: cuenta.id }, data: { saldo: saldoDespues } });
    const movimiento = await tx.movimientoCuentaCliente.create({
      data: {
        cuentaId: cuenta.id,
        turnoId: turno.id,
        usuarioId: sesion.userId,
        tipo: "abono",
        monto: datos.monto,
        saldoAntes: cuenta.saldo,
        saldoDespues,
        referencia: `Abono ${datos.metodo}`,
      },
    });
    if (datos.metodo === "efectivo") {
      await tx.movimientoCaja.create({
        data: { turnoId: turno.id, usuarioId: sesion.userId, tipo: "entrada", monto: datos.monto, motivo: `Abono a crédito · cliente ${datos.contactoId}` },
      });
    }
    return movimiento;
  });
}

export async function estadoCuentaCliente(orgId: bigint, contactoId: bigint) {
  return transaccionTenant(orgId, async (tx) => {
    const cuenta = await tx.cuentaCliente.findUnique({
      where: { contactoId },
      include: { contacto: true, movimientos: { orderBy: { createdAt: "desc" }, take: 50 } },
    });
    if (!cuenta) return null;
    const primerCargo = cuenta.saldo.gt(0)
      ? await tx.movimientoCuentaCliente.findFirst({ where: { cuentaId: cuenta.id, tipo: "cargo" }, orderBy: { createdAt: "asc" } })
      : null;
    const antiguedadDias = primerCargo ? Math.floor((Date.now() - primerCargo.createdAt.getTime()) / 86_400_000) : 0;
    return { ...cuenta, antiguedadDias };
  });
}
