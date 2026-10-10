import { Prisma } from "@prisma/client";
import {
  descuentoMaximoCajero,
  puedeAutorizarDescuento,
  puedeGestionarTurnos,
  type PagoCajaEntrada,
  type PartidaCajaEntrada,
  validarCantidadProducto,
} from "@/lib/caja";
import { CERO_DECIMAL } from "@/lib/retail";
import { calcularPrecios } from "@/lib/precios-db";
import { bloquearProductos, ErrorRetail, reservasActivasPorProducto, transaccionTenant } from "@/lib/retail-db";

export type IdentidadCaja = { userId: bigint; orgId: bigint; rol?: string; puesto?: string };

export class ErrorCaja extends ErrorRetail {}

export async function bloquearTurnoCaja(tx: Prisma.TransactionClient, turnoId: bigint) {
  await tx.$queryRaw<Array<{ id: bigint }>>`
    SELECT id FROM turnos_caja WHERE id = ${turnoId} FOR UPDATE
  `;
}

export async function abrirTurnoCaja(
  sesion: IdentidadCaja,
  datos: { cajaId: bigint; fondoInicial: Prisma.Decimal },
) {
  try {
    return await transaccionTenant(sesion.orgId, async (tx) => {
      await tx.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
        SELECT id FROM usuarios WHERE id = ${sesion.userId} FOR UPDATE
      `);
      await tx.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
        SELECT id FROM cajas WHERE id = ${datos.cajaId} FOR UPDATE
      `);
      const [caja, turnoUsuario, turnoCaja] = await Promise.all([
        tx.caja.findUnique({ where: { id: datos.cajaId } }),
        tx.turnoCaja.findFirst({ where: { usuarioId: sesion.userId, estado: "abierto" } }),
        tx.turnoCaja.findFirst({ where: { cajaId: datos.cajaId, estado: "abierto" } }),
      ]);
      if (!caja?.activa) throw new ErrorCaja("La caja no existe o está inactiva", 404);
      if (turnoUsuario) throw new ErrorCaja("Esta persona ya tiene un turno abierto", 409);
      if (turnoCaja) throw new ErrorCaja("Esta caja ya tiene un turno abierto", 409);
      return tx.turnoCaja.create({
        data: { cajaId: datos.cajaId, usuarioId: sesion.userId, fondoInicial: datos.fondoInicial },
        include: { caja: true, usuario: { select: { id: true, nombre: true } } },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ErrorCaja("La persona o la caja ya tienen un turno abierto", 409);
    }
    throw error;
  }
}

export async function movimientoCaja(
  sesion: IdentidadCaja,
  datos: { turnoId: bigint; tipo: "entrada" | "salida"; monto: Prisma.Decimal; motivo: string },
) {
  return transaccionTenant(sesion.orgId, async (tx) => {
    await bloquearTurnoCaja(tx, datos.turnoId);
    const turno = await tx.turnoCaja.findUnique({ where: { id: datos.turnoId } });
    if (!turno || turno.estado !== "abierto") throw new ErrorCaja("El turno no está abierto", 409);
    if (turno.usuarioId !== sesion.userId && sesion.rol !== "admin") {
      throw new ErrorCaja("No puedes mover efectivo de otro turno", 403);
    }
    return tx.movimientoCaja.create({ data: { ...datos, usuarioId: sesion.userId } });
  });
}

async function totalesTurno(tx: Prisma.TransactionClient, turnoId: bigint) {
  const [turno, ventas, movimientos] = await Promise.all([
    tx.turnoCaja.findUnique({
      where: { id: turnoId },
      include: { caja: true, usuario: { select: { id: true, nombre: true } } },
    }),
    tx.venta.findMany({
      where: { turnoId },
      select: { id: true, estado: true, total: true, cambio: true, pagos: true },
    }),
    tx.movimientoCaja.findMany({ where: { turnoId } }),
  ]);
  if (!turno) throw new ErrorCaja("Turno no encontrado", 404);
  const ventasVigentes = ventas.filter((venta) => venta.estado !== "cancelada");
  const ventasTotal = ventasVigentes.reduce((suma, venta) => suma.plus(venta.total), CERO_DECIMAL);
  const efectivoCobrado = ventas.reduce(
    (suma, venta) => suma.plus(venta.pagos.find((pago) => pago.metodo === "efectivo")?.monto ?? 0).minus(venta.cambio),
    CERO_DECIMAL,
  );
  const entradas = movimientos.filter((m) => m.tipo === "entrada").reduce((suma, m) => suma.plus(m.monto), CERO_DECIMAL);
  const salidas = movimientos.filter((m) => m.tipo === "salida").reduce((suma, m) => suma.plus(m.monto), CERO_DECIMAL);
  const efectivoEsperado = turno.fondoInicial.plus(efectivoCobrado).plus(entradas).minus(salidas);
  return { turno, ventasTotal, efectivoCobrado, entradas, salidas, efectivoEsperado, ventas: ventasVigentes.length };
}

async function notasCreditoBloqueadas(tx: Prisma.TransactionClient, contactoId: bigint) {
  const filas = await tx.$queryRaw<Array<{ id: bigint }>>(Prisma.sql`
    SELECT id
    FROM notas_credito_cliente
    WHERE contacto_id = ${contactoId} AND saldo > 0
    ORDER BY id
    FOR UPDATE
  `);
  if (filas.length === 0) return [];
  return tx.notaCreditoCliente.findMany({
    where: { id: { in: filas.map((fila) => fila.id) } },
    orderBy: { id: "asc" },
  });
}

async function consumirNotasCredito(
  tx: Prisma.TransactionClient,
  contactoId: bigint,
  monto: Prisma.Decimal,
) {
  const notas = await notasCreditoBloqueadas(tx, contactoId);
  const disponible = notas.reduce((suma, nota) => suma.plus(nota.saldo), CERO_DECIMAL);
  if (disponible.lt(monto)) throw new ErrorCaja("El saldo de notas de crédito no cubre el monto indicado", 409);
  let restante = monto;
  for (const nota of notas) {
    if (restante.isZero()) break;
    const aplicado = nota.saldo.lte(restante) ? nota.saldo : restante;
    await tx.notaCreditoCliente.update({
      where: { id: nota.id },
      data: { saldo: nota.saldo.minus(aplicado) },
    });
    restante = restante.minus(aplicado);
  }
}

export async function corteX(sesion: IdentidadCaja, turnoId: bigint) {
  return transaccionTenant(sesion.orgId, async (tx) => {
    const totales = await totalesTurno(tx, turnoId);
    if (
      totales.turno.usuarioId !== sesion.userId &&
      !puedeGestionarTurnos(sesion.rol, sesion.puesto)
    ) {
      throw new ErrorCaja("Turno no encontrado", 404);
    }
    return totales;
  });
}

export async function cerrarTurnoCaja(
  sesion: IdentidadCaja,
  turnoId: bigint,
  efectivoContado: Prisma.Decimal,
) {
  return transaccionTenant(sesion.orgId, async (tx) => {
    await bloquearTurnoCaja(tx, turnoId);
    const totales = await totalesTurno(tx, turnoId);
    if (totales.turno.estado !== "abierto") throw new ErrorCaja("El corte Z ya fue realizado", 409);
    if (
      totales.turno.usuarioId !== sesion.userId &&
      !puedeGestionarTurnos(sesion.rol, sesion.puesto)
    ) {
      throw new ErrorCaja("No puedes cerrar el turno de otra persona", 403);
    }
    const diferencia = efectivoContado.minus(totales.efectivoEsperado);
    const turno = await tx.turnoCaja.update({
      where: { id: turnoId },
      data: {
        estado: "cerrado",
        cerradoAt: new Date(),
        efectivoContado,
        efectivoEsperado: totales.efectivoEsperado,
        diferencia,
      },
      include: { caja: true, usuario: { select: { id: true, nombre: true } } },
    });
    return { ...totales, turno, diferencia };
  });
}

type VentaCajaDatos = {
  turnoId: bigint;
  contactoId: bigint | null;
  uuidCliente: string;
  descuento: Prisma.Decimal;
  notas: string | null;
  partidas: readonly PartidaCajaEntrada[];
  pagos: readonly PagoCajaEntrada[];
};

export async function registrarVentaCaja(sesion: IdentidadCaja, datos: VentaCajaDatos) {
  try {
    return await transaccionTenant(sesion.orgId, async (tx) => {
      await bloquearTurnoCaja(tx, datos.turnoId);
      const turno = await tx.turnoCaja.findUnique({ where: { id: datos.turnoId } });
      if (!turno || turno.estado !== "abierto") throw new ErrorCaja("Abre un turno antes de cobrar", 409);
      if (turno.usuarioId !== sesion.userId) throw new ErrorCaja("El turno pertenece a otra persona", 403);

      const repetida = await tx.venta.findFirst({
        where: { uuidCliente: datos.uuidCliente },
        include: { contacto: true, creadoPor: true, caja: true, turno: true, pagos: true, partidas: { include: { producto: true } } },
      });
      if (repetida) return { venta: repetida, repetida: true };
      if (datos.contactoId && !(await tx.contacto.findUnique({ where: { id: datos.contactoId } }))) {
        throw new ErrorCaja("El cliente no existe", 404);
      }

      await bloquearProductos(tx, datos.partidas.map((partida) => partida.productoId));
      const precios = await calcularPrecios(tx, datos.partidas, { contactoId: datos.contactoId });
      const porId = new Map(precios.map((precio) => [String(precio.producto.id), precio]));
      const reservadas = await reservasActivasPorProducto(tx, datos.partidas.map((partida) => partida.productoId));
      let subtotal = CERO_DECIMAL;
      let descuentosPartidas = CERO_DECIMAL;
      for (const partida of datos.partidas) {
        const calculo = porId.get(String(partida.productoId));
        if (!calculo) throw new ErrorCaja("Producto no encontrado");
        const producto = calculo.producto;
        if (!validarCantidadProducto(partida.cantidad, producto.vendePorPeso)) {
          throw new ErrorCaja(`${producto.nombre} se vende por piezas enteras`);
        }
        if (producto.stock.minus(reservadas.get(String(producto.id)) ?? 0).lt(partida.cantidad)) throw new ErrorCaja(`No hay existencias suficientes de ${producto.nombre}`, 409);
        if (partida.descuento.gt(calculo.total)) throw new ErrorCaja(`El descuento de ${producto.nombre} supera su importe`);
        subtotal = subtotal.plus(calculo.bruto);
        descuentosPartidas = descuentosPartidas.plus(partida.descuento).plus(calculo.descuentoPromocion);
      }
      const baseTrasPartidas = subtotal.minus(descuentosPartidas);
      if (datos.descuento.gt(baseTrasPartidas)) throw new ErrorCaja("El descuento general supera el subtotal");
      const descuentoTotal = descuentosPartidas.plus(datos.descuento);
      const total = subtotal.minus(descuentoTotal);
      const modulo = await tx.moduloOrg.findFirst({ where: { clave: "caja", activo: true }, select: { config: true } });
      const maximo = descuentoMaximoCajero(modulo?.config);
      const porcentaje = subtotal.isZero() ? CERO_DECIMAL : descuentoTotal.mul(100).div(subtotal);
      if (!puedeAutorizarDescuento(sesion.rol, sesion.puesto) && porcentaje.gt(maximo)) {
        throw new ErrorCaja(`El descuento supera el ${maximo}% permitido para Cajero`, 403);
      }
      const pagado = datos.pagos.reduce((suma, pago) => suma.plus(pago.monto), CERO_DECIMAL);
      const efectivo = datos.pagos.find((pago) => pago.metodo === "efectivo")?.monto ?? CERO_DECIMAL;
      const notaCredito = datos.pagos.find((pago) => pago.metodo === "nota_credito")?.monto ?? CERO_DECIMAL;
      if (notaCredito.gt(0) && datos.contactoId === null) {
        throw new ErrorCaja("La nota de crédito requiere seleccionar un cliente", 409);
      }
      if (notaCredito.gt(total)) throw new ErrorCaja("La nota de crédito no puede superar el total de la venta");
      const cambio = pagado.minus(total);
      if (cambio.lt(0)) throw new ErrorCaja("El pago no cubre el total");
      if (cambio.gt(efectivo)) throw new ErrorCaja("Solo el efectivo puede generar cambio");
      if (notaCredito.gt(0)) await consumirNotasCredito(tx, datos.contactoId!, notaCredito);

      const metodoPago = datos.pagos.length === 1 ? datos.pagos[0].metodo : "mixto";
      const venta = await tx.venta.create({
        data: {
          folio: `V-${Date.now().toString(36).toUpperCase()}-${datos.uuidCliente.slice(-6).toUpperCase()}`,
          turnoId: turno.id,
          cajaId: turno.cajaId,
          uuidCliente: datos.uuidCliente,
          contactoId: datos.contactoId,
          creadoPorId: sesion.userId,
          estado: "pagada",
          canal: "mostrador",
          metodoPago,
          subtotal,
          descuento: descuentoTotal,
          total,
          cambio,
          notas: datos.notas,
          stockAplicado: true,
        },
      });
      await tx.pagoVenta.createMany({
        data: datos.pagos.map((pago) => ({ ventaId: venta.id, metodo: pago.metodo, monto: pago.monto })),
      });
      for (const partida of datos.partidas) {
        const calculo = porId.get(String(partida.productoId))!;
        const producto = calculo.producto;
        const existenciaDespues = producto.stock.minus(partida.cantidad);
        await tx.ventaPartida.create({
          data: {
            ventaId: venta.id,
            productoId: producto.id,
            cantidad: partida.cantidad,
            precioUnitario: calculo.precioUnitario,
            descuento: partida.descuento.plus(calculo.descuentoPromocion),
            descuentoPromocion: calculo.descuentoPromocion,
            promocionDescripcion: calculo.promocionDescripcion,
            total: calculo.total.minus(partida.descuento),
          },
        });
        await tx.producto.update({ where: { id: producto.id }, data: { stock: existenciaDespues } });
        await tx.movimientoInventario.create({
          data: {
            productoId: producto.id,
            ventaId: venta.id,
            usuarioId: sesion.userId,
            tipo: "venta",
            cantidad: partida.cantidad.neg(),
            existenciaAntes: producto.stock,
            existenciaDespues,
            motivo: `Venta ${venta.folio}`,
          },
        });
      }
      const completa = await tx.venta.findUniqueOrThrow({
        where: { id: venta.id },
        include: { contacto: true, creadoPor: true, caja: true, turno: true, pagos: true, partidas: { include: { producto: true } } },
      });
      return { venta: completa, repetida: false };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existente = await transaccionTenant(sesion.orgId, (tx) => tx.venta.findFirst({
        where: { uuidCliente: datos.uuidCliente },
        include: { contacto: true, creadoPor: true, caja: true, turno: true, pagos: true, partidas: { include: { producto: true } } },
      }));
      if (existente) return { venta: existente, repetida: true };
    }
    throw error;
  }
}
