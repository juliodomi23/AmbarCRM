import { Prisma } from "@prisma/client";
import { configReservas } from "@/lib/reservas/servidor";
import { rangoReporte, fechaHoraLocal } from "@/lib/reportes-retail";
import { transaccionTenant } from "@/lib/retail-db";
import { ingresosNetosPorPartida } from "@/lib/venta-importes";

const CERO = new Prisma.Decimal(0);
type Acumulado = {
  clave: string;
  nombre: string;
  cantidad: Prisma.Decimal;
  ingresos: Prisma.Decimal;
  costos: Prisma.Decimal;
  utilidad: Prisma.Decimal;
  ingresosSinCosto: Prisma.Decimal;
  partidasSinCosto: number;
};

function nuevo(clave: string, nombre: string): Acumulado {
  return { clave, nombre, cantidad: CERO, ingresos: CERO, costos: CERO, utilidad: CERO, ingresosSinCosto: CERO, partidasSinCosto: 0 };
}

function sumar(
  mapa: Map<string, Acumulado>,
  clave: string,
  nombre: string,
  cantidad: Prisma.Decimal,
  ingreso: Prisma.Decimal,
  costo: Prisma.Decimal | null,
) {
  const fila = mapa.get(clave) ?? nuevo(clave, nombre);
  fila.cantidad = fila.cantidad.plus(cantidad);
  fila.ingresos = fila.ingresos.plus(ingreso);
  if (costo === null) {
    fila.ingresosSinCosto = fila.ingresosSinCosto.plus(ingreso);
    fila.partidasSinCosto++;
  } else {
    fila.costos = fila.costos.plus(costo);
    fila.utilidad = fila.utilidad.plus(ingreso.minus(costo));
  }
  mapa.set(clave, fila);
}

function filas(mapa: Map<string, Acumulado>) {
  return [...mapa.values()].map((fila) => ({
    clave: fila.clave, nombre: fila.nombre, cantidad: fila.cantidad, ingresos: fila.ingresos,
    costos: fila.costos, utilidad: fila.utilidad, ingresosSinCosto: fila.ingresosSinCosto,
    partidasSinCosto: fila.partidasSinCosto,
  }));
}

export async function reporteRetail(
  orgId: bigint,
  entrada: { desde: string; hasta: string; pagina?: number; tamano?: number },
) {
  return transaccionTenant(orgId, async (tx) => {
    const reservas = await tx.moduloOrg.findFirst({ where: { clave: "reservas_en_linea" }, select: { config: true } });
    const zona = reservas ? configReservas(reservas.config).zona : "America/Mexico_City";
    const rango = rangoReporte(entrada.desde, entrada.hasta, zona);
    const pagina = Number.isInteger(entrada.pagina) && entrada.pagina! > 0 ? entrada.pagina! : 1;
    const tamano = Number.isInteger(entrada.tamano) && entrada.tamano! > 0 ? Math.min(entrada.tamano!, 100) : 50;
    const dondeVentas: Prisma.VentaWhereInput = {
      createdAt: { gte: rango.inicio, lt: rango.fin },
      estado: { notIn: ["cancelada", "borrador"] },
      NOT: { canal: "tienda_en_linea", estado: "pendiente", stockAplicado: false },
    };
    const [ventas, devoluciones, productos, totalProductos, turnos] = await Promise.all([
      tx.venta.findMany({
        where: dondeVentas,
        include: {
          creadoPor: { select: { id: true, nombre: true } }, caja: { select: { id: true, nombre: true } },
          partidas: { include: { producto: { include: { grupo: { select: { id: true, nombre: true } } } } } },
        },
        orderBy: { createdAt: "asc" },
      }),
      tx.devolucionPartida.findMany({
        where: { devolucion: { createdAt: { gte: rango.inicio, lt: rango.fin } } },
        include: {
          devolucion: { include: { usuario: { select: { id: true, nombre: true } }, turno: { include: { caja: { select: { id: true, nombre: true } } } } } },
          ventaPartida: { include: { producto: { include: { grupo: { select: { id: true, nombre: true } } } } } },
        },
      }),
      tx.producto.findMany({ orderBy: { nombre: "asc" }, skip: (pagina - 1) * tamano, take: tamano }),
      tx.producto.count(),
      tx.turnoCaja.findMany({
        where: { cerradoAt: { gte: rango.inicio, lt: rango.fin }, estado: "cerrado" },
        include: { caja: { select: { id: true, nombre: true } }, usuario: { select: { id: true, nombre: true } } },
      }),
    ]);

    const porVariante = new Map<string, Acumulado>();
    const porPadre = new Map<string, Acumulado>();
    const porCategoria = new Map<string, Acumulado>();
    const porDia = new Map<string, Acumulado>();
    const porHora = new Map<string, Acumulado>();
    const porCajero = new Map<string, Acumulado>();
    const porCaja = new Map<string, Acumulado>();
    const conMovimiento = new Set<string>();

    const acumular = (dato: {
      producto: (typeof ventas)[number]["partidas"][number]["producto"];
      cantidad: Prisma.Decimal;
      ingreso: Prisma.Decimal;
      costo: Prisma.Decimal | null;
      instante: Date;
      cajero: { id: bigint; nombre: string } | null;
      caja: { id: bigint; nombre: string } | null;
    }) => {
      const local = fechaHoraLocal(dato.instante, zona);
      const padreId = dato.producto.grupoId ?? dato.producto.id;
      const padreNombre = dato.producto.grupo?.nombre ?? dato.producto.nombre;
      const categoria = dato.producto.categoria || "Sin categoría";
      conMovimiento.add(String(dato.producto.id));
      sumar(porVariante, String(dato.producto.id), dato.producto.nombre, dato.cantidad, dato.ingreso, dato.costo);
      sumar(porPadre, String(padreId), padreNombre, dato.cantidad, dato.ingreso, dato.costo);
      sumar(porCategoria, categoria, categoria, dato.cantidad, dato.ingreso, dato.costo);
      sumar(porDia, local.fecha, local.fecha, dato.cantidad, dato.ingreso, dato.costo);
      sumar(porHora, local.hora, local.hora, dato.cantidad, dato.ingreso, dato.costo);
      sumar(porCajero, dato.cajero ? String(dato.cajero.id) : "sin-cajero", dato.cajero?.nombre ?? "Sin cajero", dato.cantidad, dato.ingreso, dato.costo);
      sumar(porCaja, dato.caja ? String(dato.caja.id) : "sin-caja", dato.caja?.nombre ?? "Sin caja", dato.cantidad, dato.ingreso, dato.costo);
    };

    let envios = CERO;
    for (const venta of ventas) {
      envios = envios.plus(venta.costoEnvio);
      const importes = ingresosNetosPorPartida(venta.partidas, venta.total.minus(venta.costoEnvio));
      for (const partida of venta.partidas) {
        const ingreso = importes.get(String(partida.id)) ?? CERO;
        const costo = partida.costoUnitario === null ? null : partida.costoUnitario.mul(partida.cantidad).toDecimalPlaces(2);
        acumular({ producto: partida.producto, cantidad: partida.cantidad, ingreso, costo, instante: venta.createdAt, cajero: venta.creadoPor, caja: venta.caja });
      }
    }
    for (const devolucion of devoluciones) {
      const partida = devolucion.ventaPartida;
      const costo = partida.costoUnitario === null ? null : partida.costoUnitario.mul(devolucion.cantidad).neg().toDecimalPlaces(2);
      acumular({
        producto: partida.producto, cantidad: devolucion.cantidad.neg(), ingreso: devolucion.monto.neg(), costo,
        instante: devolucion.devolucion.createdAt, cajero: devolucion.devolucion.usuario,
        caja: devolucion.devolucion.turno?.caja ?? null,
      });
    }

    const variantes = filas(porVariante).sort((a, b) => b.ingresos.comparedTo(a.ingresos));
    const resumen = [...porVariante.values()].reduce((total, fila) => ({
      ingresos: total.ingresos.plus(fila.ingresos), costos: total.costos.plus(fila.costos),
      utilidad: total.utilidad.plus(fila.utilidad), ingresosSinCosto: total.ingresosSinCosto.plus(fila.ingresosSinCosto),
      partidasSinCosto: total.partidasSinCosto + fila.partidasSinCosto,
    }), { ingresos: CERO, costos: CERO, utilidad: CERO, ingresosSinCosto: CERO, partidasSinCosto: 0 });
    const cortes = new Map<string, { clave: string; nombre: string; diferencia: Prisma.Decimal; turnos: number }>();
    for (const turno of turnos) {
      for (const [prefijo, entidad] of [["cajero", turno.usuario], ["caja", turno.caja]] as const) {
        const clave = `${prefijo}:${entidad.id}`;
        const fila = cortes.get(clave) ?? { clave, nombre: entidad.nombre, diferencia: CERO, turnos: 0 };
        fila.diferencia = fila.diferencia.plus(turno.diferencia ?? 0); fila.turnos++;
        cortes.set(clave, fila);
      }
    }
    return {
      zona, rango: { desde: rango.desde, hasta: rango.hasta, dias: rango.dias }, resumen, envios,
      productos: { variantes, agrupados: filas(porPadre).sort((a, b) => b.ingresos.comparedTo(a.ingresos)) },
      categorias: filas(porCategoria).sort((a, b) => b.ingresos.comparedTo(a.ingresos)),
      ventas: {
        porDia: filas(porDia).sort((a, b) => a.clave.localeCompare(b.clave)),
        porHora: filas(porHora).sort((a, b) => a.clave.localeCompare(b.clave)),
        porCajero: filas(porCajero).sort((a, b) => b.ingresos.comparedTo(a.ingresos)),
        porCaja: filas(porCaja).sort((a, b) => b.ingresos.comparedTo(a.ingresos)),
      },
      inventario: {
        filas: productos.map((producto) => ({
          id: producto.id, nombre: producto.nombre, sku: producto.sku, stock: producto.stock, stockMinimo: producto.stockMinimo,
          valorCosto: producto.stock.mul(producto.costo).toDecimalPlaces(2), valorPrecio: producto.stock.mul(producto.precio).toDecimalPlaces(2),
          sinMovimiento: !conMovimiento.has(String(producto.id)), alertaMinimo: producto.stockMinimo.gt(0) && producto.stock.lte(producto.stockMinimo),
        })),
        pagina, tamano, total: totalProductos,
      },
      cortes: [...cortes.values()].sort((a, b) => a.clave.localeCompare(b.clave)),
      conteos: { ventas: ventas.length, devoluciones: devoluciones.length },
    };
  });
}
