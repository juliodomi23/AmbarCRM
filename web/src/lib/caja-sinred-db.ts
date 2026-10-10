import { Prisma } from "@prisma/client";
import {
  descuentoMaximoCajero,
  puedeAutorizarDescuento,
  validarCantidadProducto,
} from "@/lib/caja";
import { bloquearTurnoCaja, ErrorCaja, type IdentidadCaja } from "@/lib/caja-db";
import {
  antesDelTurno,
  despuesDelCierre,
  ventanaVentaSinRed,
  type CodigoSinRed,
  type VentaSinRedEntrada,
} from "@/lib/caja-sinred";
import { calcularPrecios } from "@/lib/precios-db";
import { CERO_DECIMAL } from "@/lib/retail";
import { bloquearProductos, transaccionTenant } from "@/lib/retail-db";

/** `registrar = false`: no es un rechazo definitivo (se reintenta o espera), así que no entra a cola_caja_rechazos. */
export class ErrorSinRed extends ErrorCaja {
  constructor(mensaje: string, readonly codigo: CodigoSinRed, status = 400, readonly registrar = true) {
    super(mensaje, status);
  }
}

const INCLUIR_VENTA = {
  contacto: true, creadoPor: true, caja: true, turno: true, pagos: true, partidas: { include: { producto: true } },
} as const;

/**
 * Sube una venta cobrada sin internet. A diferencia de `registrarVentaCaja`: respeta lo cobrado aunque el precio
 * del servidor sea otro (queda marcada), no exige existencia (puede quedar negativa, marcada) y acepta un turno
 * ya cerrado sin tocar su corte Z. Idempotente por `uuidCliente`.
 */
export async function registrarVentaSinRed(sesion: IdentidadCaja, datos: VentaSinRedEntrada, ahora: Date = new Date()) {
  try {
    return await transaccionTenant(sesion.orgId, async (tx) => {
      const repetida = await tx.venta.findFirst({ where: { uuidCliente: datos.uuidCliente }, include: INCLUIR_VENTA });
      if (repetida) return { venta: repetida, repetida: true };
      const rechazada = await tx.colaCajaRechazo.findFirst({ where: { uuidCliente: datos.uuidCliente, resueltaAt: null } });
      if (rechazada) throw new ErrorSinRed(rechazada.motivo, (rechazada.codigo as CodigoSinRed | null) ?? "VENTA_RECHAZADA", 400, false);

      const ventana = ventanaVentaSinRed(datos.vendidaAt, ahora);
      if (ventana === "FECHA_FUTURA") throw new ErrorSinRed("La fecha de la venta es posterior a la actual", "FECHA_FUTURA");
      if (ventana === "VENTA_MUY_ANTIGUA") {
        throw new ErrorSinRed("La venta tiene más de 72 horas; regístrala manualmente con el Encargado", "VENTA_MUY_ANTIGUA");
      }

      await bloquearTurnoCaja(tx, datos.turnoId);
      // Con el turno bloqueado, un reenvío simultáneo ya vería la venta que acaba de confirmar el primero.
      const confirmada = await tx.venta.findFirst({ where: { uuidCliente: datos.uuidCliente }, include: INCLUIR_VENTA });
      if (confirmada) return { venta: confirmada, repetida: true };
      const origen = await tx.turnoCaja.findUnique({ where: { id: datos.turnoId } });
      if (!origen) throw new ErrorSinRed("El turno de la venta no existe", "TURNO_NO_EXISTE", 404);
      if (origen.usuarioId !== sesion.userId) throw new ErrorSinRed("El turno pertenece a otra persona", "TURNO_AJENO", 403);
      if (antesDelTurno(datos.vendidaAt, origen.abiertoAt)) {
        throw new ErrorSinRed("La venta es anterior a la apertura del turno", "FECHA_ANTERIOR_AL_TURNO");
      }

      // Turno abierto: entra ahí. Cerrado y la venta fue antes del corte: entra a ese turno sin reescribir su Z.
      // Cerrado y la venta fue después del corte: no pertenece a ese corte; va al turno abierto actual de la persona.
      let destino = origen;
      let turnoOriginalId: bigint | null = null;
      const motivos: string[] = [];
      if (origen.estado !== "abierto") {
        motivos.push("tardia");
        if (origen.cerradoAt && despuesDelCierre(datos.vendidaAt, origen.cerradoAt)) {
          const actual = await tx.turnoCaja.findFirst({ where: { usuarioId: sesion.userId, estado: "abierto" } });
          if (!actual) throw new ErrorSinRed("Abre un turno para subir esta venta", "TURNO_REQUERIDO", 409, false);
          await bloquearTurnoCaja(tx, actual.id);
          const bloqueado = await tx.turnoCaja.findUnique({ where: { id: actual.id } });
          if (!bloqueado || bloqueado.estado !== "abierto") throw new ErrorSinRed("Abre un turno para subir esta venta", "TURNO_REQUERIDO", 409, false);
          destino = bloqueado;
          turnoOriginalId = origen.id;
        }
      }

      await bloquearProductos(tx, datos.partidas.map((partida) => partida.productoId));
      const precios = await calcularPrecios(tx, datos.partidas, { ahora: datos.vendidaAt });
      const porId = new Map(precios.map((precio) => [String(precio.producto.id), precio]));
      let subtotal = CERO_DECIMAL;
      let descuentosPromocion = CERO_DECIMAL;
      let descuentosManuales = CERO_DECIMAL;
      for (const partida of datos.partidas) {
        const calculo = porId.get(String(partida.productoId));
        if (!calculo) throw new ErrorSinRed("Producto no encontrado", "DATOS_INVALIDOS", 404);
        if (!validarCantidadProducto(partida.cantidad, calculo.producto.vendePorPeso)) {
          throw new ErrorSinRed(`${calculo.producto.nombre} se vende por piezas enteras`, "DATOS_INVALIDOS");
        }
        if (partida.descuento.gt(calculo.total)) {
          throw new ErrorSinRed(`El descuento de ${calculo.producto.nombre} supera su importe`, "DATOS_INVALIDOS");
        }
        subtotal = subtotal.plus(calculo.bruto);
        descuentosPromocion = descuentosPromocion.plus(calculo.descuentoPromocion);
        descuentosManuales = descuentosManuales.plus(partida.descuento);
      }
      const baseTrasPartidas = subtotal.minus(descuentosPromocion).minus(descuentosManuales);
      if (datos.descuento.gt(baseTrasPartidas)) throw new ErrorSinRed("El descuento general supera el subtotal", "DATOS_INVALIDOS");

      const modulo = await tx.moduloOrg.findFirst({ where: { clave: "caja", activo: true }, select: { config: true } });
      const maximo = descuentoMaximoCajero(modulo?.config);
      const baseTrasPromocion = subtotal.minus(descuentosPromocion);
      const descuentoManual = descuentosManuales.plus(datos.descuento);
      const porcentaje = baseTrasPromocion.isZero() ? CERO_DECIMAL : descuentoManual.mul(100).div(baseTrasPromocion);
      if (!puedeAutorizarDescuento(sesion.rol, sesion.puesto) && porcentaje.gt(maximo)) {
        throw new ErrorSinRed(`El descuento supera el ${maximo}% permitido para Cajero`, "DATOS_INVALIDOS", 403);
      }

      const totalServidor = baseTrasPartidas.minus(datos.descuento);
      const total = datos.totalCobrado;
      const pagado = datos.pagos.reduce((suma, pago) => suma.plus(pago.monto), CERO_DECIMAL);
      const efectivo = datos.pagos.find((pago) => pago.metodo === "efectivo")?.monto ?? CERO_DECIMAL;
      const cambio = pagado.minus(total);
      if (cambio.lt(0)) throw new ErrorSinRed("El pago no cubre lo cobrado", "DATOS_INVALIDOS");
      if (cambio.gt(efectivo)) throw new ErrorSinRed("Solo el efectivo puede generar cambio", "DATOS_INVALIDOS");

      // Se respeta lo cobrado: la diferencia con el precio del servidor queda marcada para revisión.
      let diferenciaPrecio: Prisma.Decimal | null = null;
      if (!totalServidor.eq(total)) {
        motivos.push("precio_distinto");
        diferenciaPrecio = totalServidor.minus(total);
      }
      const subtotalVenta = total.gt(subtotal) ? total : subtotal;
      const descuentoVenta = subtotalVenta.minus(total);

      const venta = await tx.venta.create({
        data: {
          folio: datos.folio,
          turnoId: destino.id,
          turnoOriginalId,
          cajaId: destino.cajaId,
          uuidCliente: datos.uuidCliente,
          contactoId: null,
          creadoPorId: sesion.userId,
          estado: "pagada",
          canal: "mostrador",
          metodoPago: datos.pagos.length === 1 ? datos.pagos[0].metodo : "mixto",
          subtotal: subtotalVenta,
          descuento: descuentoVenta,
          total,
          cambio,
          notas: datos.notas,
          stockAplicado: true,
          sinRed: true,
          vendidaAt: datos.vendidaAt,
          subidaAt: ahora,
          createdAt: datos.vendidaAt,
          catalogoVersion: datos.catalogoVersion,
          diferenciaPrecio,
          revisionMotivos: motivos,
        },
      });
      await tx.pagoVenta.createMany({
        data: datos.pagos.map((pago) => ({ ventaId: venta.id, metodo: pago.metodo, monto: pago.monto })),
      });
      let negativo = false;
      for (const partida of datos.partidas) {
        const calculo = porId.get(String(partida.productoId))!;
        const producto = calculo.producto;
        const actual = await tx.producto.findUniqueOrThrow({ where: { id: producto.id }, select: { stock: true } });
        const existenciaDespues = actual.stock.minus(partida.cantidad);
        if (existenciaDespues.lt(0)) negativo = true;
        await tx.ventaPartida.create({
          data: {
            ventaId: venta.id,
            productoId: producto.id,
            cantidad: partida.cantidad,
            precioUnitario: calculo.precioUnitario,
            costoUnitario: producto.costo,
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
            existenciaAntes: actual.stock,
            existenciaDespues,
            motivo: `Venta sin internet ${venta.folio}`,
            sinRed: true,
          },
        });
      }
      if (negativo) {
        await tx.venta.update({ where: { id: venta.id }, data: { revisionMotivos: [...motivos, "inventario_negativo"] } });
      }
      return { venta: await tx.venta.findUniqueOrThrow({ where: { id: venta.id }, include: INCLUIR_VENTA }), repetida: false };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existente = await transaccionTenant(sesion.orgId, (tx) =>
        tx.venta.findFirst({ where: { uuidCliente: datos.uuidCliente }, include: INCLUIR_VENTA }));
      if (existente) return { venta: existente, repetida: true };
      throw new ErrorSinRed("Ya existe otra venta con ese folio", "DATOS_INVALIDOS", 409);
    }
    throw error;
  }
}

/** Deja el rechazo definitivo para el Encargado; reintentar la misma venta no duplica la fila. */
export async function registrarRechazoSinRed(
  sesion: IdentidadCaja,
  rechazo: { uuidCliente: string; turnoId: bigint | null; vendidaAt: Date | null; codigo: CodigoSinRed; motivo: string; payload: Prisma.InputJsonValue },
) {
  await transaccionTenant(sesion.orgId, (tx) =>
    tx.colaCajaRechazo.createMany({
      data: [{
        uuidCliente: rechazo.uuidCliente,
        usuarioId: sesion.userId,
        turnoId: rechazo.turnoId,
        vendidaAt: rechazo.vendidaAt,
        codigo: rechazo.codigo,
        motivo: rechazo.motivo,
        payload: rechazo.payload,
      }],
      skipDuplicates: true,
    }));
}
