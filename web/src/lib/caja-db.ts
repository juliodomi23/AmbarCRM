import { Prisma } from "@prisma/client";
import {
  descuentoMaximoCajero,
  puedeAutorizarDescuento,
  type PagoCajaEntrada,
  type PartidaCajaEntrada,
  validarCantidadProducto,
} from "@/lib/caja";
import { CERO_DECIMAL, importePartida } from "@/lib/retail";
import { bloquearProductos, ErrorRetail, transaccionTenant } from "@/lib/retail-db";

type IdentidadCaja = { userId: bigint; orgId: bigint; rol?: string; puesto?: string };

export class ErrorCaja extends ErrorRetail {}

async function bloquearTurno(tx: Prisma.TransactionClient, turnoId: bigint) {
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
    await bloquearTurno(tx, datos.turnoId);
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
      where: { turnoId, estado: { not: "cancelada" } },
      select: { id: true, total: true, cambio: true, pagos: true },
    }),
    tx.movimientoCaja.findMany({ where: { turnoId } }),
  ]);
  if (!turno) throw new ErrorCaja("Turno no encontrado", 404);
  const ventasTotal = ventas.reduce((suma, venta) => suma.plus(venta.total), CERO_DECIMAL);
  const efectivoCobrado = ventas.reduce(
    (suma, venta) => suma.plus(venta.pagos.find((pago) => pago.metodo === "efectivo")?.monto ?? 0).minus(venta.cambio),
    CERO_DECIMAL,
  );
  const entradas = movimientos.filter((m) => m.tipo === "entrada").reduce((suma, m) => suma.plus(m.monto), CERO_DECIMAL);
  const salidas = movimientos.filter((m) => m.tipo === "salida").reduce((suma, m) => suma.plus(m.monto), CERO_DECIMAL);
  const efectivoEsperado = turno.fondoInicial.plus(efectivoCobrado).plus(entradas).minus(salidas);
  return { turno, ventasTotal, efectivoCobrado, entradas, salidas, efectivoEsperado, ventas: ventas.length };
}

export async function corteX(orgId: bigint, turnoId: bigint) {
  return transaccionTenant(orgId, (tx) => totalesTurno(tx, turnoId));
}

export async function cerrarTurnoCaja(
  sesion: IdentidadCaja,
  turnoId: bigint,
  efectivoContado: Prisma.Decimal,
) {
  return transaccionTenant(sesion.orgId, async (tx) => {
    await bloquearTurno(tx, turnoId);
    const totales = await totalesTurno(tx, turnoId);
    if (totales.turno.estado !== "abierto") throw new ErrorCaja("El corte Z ya fue realizado", 409);
    if (totales.turno.usuarioId !== sesion.userId && sesion.rol !== "admin") {
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
      await bloquearTurno(tx, datos.turnoId);
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
      const productos = await tx.producto.findMany({
        where: { id: { in: datos.partidas.map((partida) => partida.productoId) }, activo: true },
      });
      if (productos.length !== datos.partidas.length) throw new ErrorCaja("Uno de los productos no existe o está inactivo");
      const porId = new Map(productos.map((producto) => [String(producto.id), producto]));
      let subtotal = CERO_DECIMAL;
      let descuentosPartidas = CERO_DECIMAL;
      for (const partida of datos.partidas) {
        const producto = porId.get(String(partida.productoId));
        if (!producto) throw new ErrorCaja("Producto no encontrado");
        if (!validarCantidadProducto(partida.cantidad, producto.vendePorPeso)) {
          throw new ErrorCaja(`${producto.nombre} se vende por piezas enteras`);
        }
        if (producto.stock.lt(partida.cantidad)) throw new ErrorCaja(`No hay existencias suficientes de ${producto.nombre}`, 409);
        const bruto = importePartida(producto.precio, partida.cantidad);
        if (partida.descuento.gt(bruto)) throw new ErrorCaja(`El descuento de ${producto.nombre} supera su importe`);
        subtotal = subtotal.plus(bruto);
        descuentosPartidas = descuentosPartidas.plus(partida.descuento);
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
      const cambio = pagado.minus(total);
      if (cambio.lt(0)) throw new ErrorCaja("El pago no cubre el total");
      if (cambio.gt(efectivo)) throw new ErrorCaja("Solo el efectivo puede generar cambio");

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
        const producto = porId.get(String(partida.productoId))!;
        const bruto = importePartida(producto.precio, partida.cantidad);
        const existenciaDespues = producto.stock.minus(partida.cantidad);
        await tx.ventaPartida.create({
          data: {
            ventaId: venta.id,
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
