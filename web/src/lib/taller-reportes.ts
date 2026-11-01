import { db } from "@/lib/db";
import { fechaLocal, sumarDias } from "@/lib/reservas/horarios";
import { ZONA_TALLER } from "@/lib/taller-mensajes";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DIAS = 366;

export function hoyTaller(ahora = new Date()) {
  return fechaLocal(ahora, ZONA_TALLER);
}

/** Periodo por defecto: últimos 30 días, con hoy incluido. */
export function periodoReporte(desde?: string | null, hasta?: string | null) {
  const fin = hasta && FECHA.test(hasta) && Number.isFinite(Date.parse(`${hasta}T12:00:00Z`)) ? hasta : hoyTaller();
  const inicio =
    desde && FECHA.test(desde) && Number.isFinite(Date.parse(`${desde}T12:00:00Z`)) ? desde : sumarDias(fin, -29);
  if (inicio > fin) return { desde: fin, hasta: fin };
  const dias = Math.round((Date.parse(`${fin}T12:00:00Z`) - Date.parse(`${inicio}T12:00:00Z`)) / 86_400_000) + 1;
  return dias > MAX_DIAS ? { desde: sumarDias(fin, -(MAX_DIAS - 1)), hasta: fin } : { desde: inicio, hasta: fin };
}

/**
 * México dejó el horario de verano en 2022: todo el año es UTC-6.
 * El rango cubre el día completo en hora del taller, no en hora del servidor.
 */
export function rangoReporte(desde: string, hasta: string) {
  return {
    gte: new Date(`${desde}T00:00:00-06:00`),
    lt: new Date(`${sumarDias(hasta, 1)}T00:00:00-06:00`),
  };
}

export type ReporteTaller = Awaited<ReturnType<typeof reportesTaller>>;

export async function reportesTaller(desde: string, hasta: string) {
  const periodo = periodoReporte(desde, hasta);
  const rango = rangoReporte(periodo.desde, periodo.hasta);

  const [ordenesPeriodo, cambios, pagosPeriodo, facturables, recordatorios, embudo, refaccionesStock] = await Promise.all([
    db.tallerOrden.findMany({
      where: { createdAt: rango },
      select: {
        id: true,
        numero: true,
        createdAt: true,
        estado: true,
        total: true,
        mecanicoId: true,
        vehiculo: { select: { marca: true, modelo: true, placa: true, contacto: { select: { nombre: true } } } },
        pagos: { select: { monto: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.tallerOrdenCambio.findMany({
      where: { creadoAt: rango, estado: { in: ["entregado", "cancelado"] } },
      select: { ordenId: true, estado: true, creadoAt: true },
    }),
    db.tallerPago.findMany({ where: { createdAt: rango }, select: { monto: true, createdAt: true } }),
    db.tallerOrden.findMany({
      where: { estado: { not: "cancelado" } },
      select: {
        id: true,
        estado: true,
        mecanicoId: true,
        total: true,
        pagos: { select: { monto: true } },
        vehiculo: { select: { contactoId: true, contacto: { select: { nombre: true } } } },
      },
    }),
    db.tallerRecordatorio.findMany({
      where: { estado: "pendiente" },
      select: { proximaFecha: true, proximoKm: true, vehiculo: { select: { kilometraje: true } } },
    }),
    db.tallerOrden.groupBy({ by: ["estado"], _count: { _all: true } }),
    db.tallerRefaccion.findMany({ select: { nombre: true, existencia: true, minimo: true } }),
  ]);

  const entregasPorOrden = new Map<string, Date>();
  for (const cambio of cambios) {
    if (cambio.estado === "entregado") entregasPorOrden.set(String(cambio.ordenId), cambio.creadoAt);
  }
  const entregas = entregasPorOrden.size
    ? await db.tallerOrden.findMany({
        where: { id: { in: [...entregasPorOrden.keys()].map(BigInt) } },
        select: {
          id: true,
          mecanicoId: true,
          total: true,
          createdAt: true,
          conceptos: {
            select: {
              tipo: true,
              cantidad: true,
              precioUnitario: true,
              refaccionId: true,
              refaccion: { select: { nombre: true, costo: true } },
            },
          },
        },
      })
    : [];
  const canceladas = new Set(cambios.filter((c) => c.estado === "cancelado").map((c) => String(c.ordenId))).size;

  const ingresosCobrados = pagosPeriodo.reduce((suma, pago) => suma + Number(pago.monto), 0);
  const ordenesAbiertas = facturables.filter((orden) => orden.estado !== "entregado").length;
  const porCobrar = facturables.reduce((suma, orden) => {
    const pagado = orden.pagos.reduce((total, pago) => total + Number(pago.monto), 0);
    return suma + Math.max(0, Number(orden.total) - pagado);
  }, 0);

  const ticketPromedio = entregas.length
    ? entregas.reduce((suma, orden) => suma + Number(orden.total), 0) / entregas.length
    : 0;

  const tiempos = entregas
    .map((orden) => {
      const entrega = entregasPorOrden.get(String(orden.id));
      return entrega ? entrega.getTime() - new Date(orden.createdAt).getTime() : null;
    })
    .filter((valor): valor is number => valor !== null && valor >= 0);
  const tiempoPromedioEntregaDias = tiempos.length
    ? Math.round((tiempos.reduce((suma, valor) => suma + valor, 0) / tiempos.length / 86_400_000) * 10) / 10
    : null;

  const mecanicos = new Map<string, { entregadas: number; manoObra: number; refacciones: number }>();
  const refacciones = new Map<string, { nombre: string; cantidad: number; importe: number; costo: number }>();
  for (const orden of entregas) {
    const clave = orden.mecanicoId === null ? "" : String(orden.mecanicoId);
    const fila = mecanicos.get(clave) ?? { entregadas: 0, manoObra: 0, refacciones: 0 };
    fila.entregadas += 1;
    for (const concepto of orden.conceptos) {
      const importe = Number(concepto.cantidad) * Number(concepto.precioUnitario);
      if (concepto.tipo === "mano_obra") fila.manoObra += importe;
      else fila.refacciones += importe;
      if (concepto.tipo === "refaccion" && concepto.refaccionId) {
        const id = String(concepto.refaccionId);
        const acumulado = refacciones.get(id) ?? {
          nombre: concepto.refaccion?.nombre ?? "Refacción eliminada",
          cantidad: 0,
          importe: 0,
          costo: 0,
        };
        acumulado.cantidad += Number(concepto.cantidad);
        acumulado.importe += importe;
        acumulado.costo += Number(concepto.cantidad) * Number(concepto.refaccion?.costo ?? 0);
        refacciones.set(id, acumulado);
      }
    }
    mecanicos.set(clave, fila);
  }
  const idsMecanicos = new Set<string>();
  for (const orden of [...entregas, ...ordenesPeriodo, ...facturables]) {
    if (orden.mecanicoId) idsMecanicos.add(String(orden.mecanicoId));
  }
  const nombres = new Map(
    (
      await db.usuario.findMany({
        where: { id: { in: [...idsMecanicos].map(BigInt) } },
        select: { id: true, nombre: true },
      })
    ).map((usuario) => [String(usuario.id), usuario.nombre]),
  );

  const serie = new Map<string, { monto: number; pagos: number }>();
  for (let fecha = periodo.desde; fecha <= periodo.hasta; fecha = sumarDias(fecha, 1)) {
    serie.set(fecha, { monto: 0, pagos: 0 });
  }
  for (const pago of pagosPeriodo) {
    const fecha = fechaLocal(pago.createdAt, ZONA_TALLER);
    const fila = serie.get(fecha);
    if (fila) {
      fila.monto += Number(pago.monto);
      fila.pagos += 1;
    }
  }

  const hoy = hoyTaller();
  const recordatoriosVencidos = recordatorios.filter(
    (recordatorio) =>
      (recordatorio.proximaFecha !== null && fechaLocal(recordatorio.proximaFecha, ZONA_TALLER) < hoy) ||
      (recordatorio.proximoKm !== null && recordatorio.proximoKm <= recordatorio.vehiculo.kilometraje),
  ).length;

  const saldosPorCliente = new Map<string, { nombre: string; ordenes: number; saldo: number }>();
  for (const orden of facturables) {
    const pagado = orden.pagos.reduce((total, pago) => total + Number(pago.monto), 0);
    const saldo = Math.max(0, Number(orden.total) - pagado);
    if (saldo <= 0) continue;
    const clave = String(orden.vehiculo.contactoId);
    const fila = saldosPorCliente.get(clave) ?? { nombre: orden.vehiculo.contacto.nombre, ordenes: 0, saldo: 0 };
    fila.ordenes += 1;
    fila.saldo += saldo;
    saldosPorCliente.set(clave, fila);
  }

  return {
    periodo,
    resumen: {
      ingresadas: ordenesPeriodo.length,
      entregadas: entregas.length,
      canceladas,
      ordenesAbiertas,
      ticketPromedio: Math.round(ticketPromedio * 100) / 100,
      ingresosCobrados: Math.round(ingresosCobrados * 100) / 100,
      porCobrar: Math.round(porCobrar * 100) / 100,
      tiempoPromedioEntregaDias,
      recordatoriosVencidos,
      piezasBajoMinimo: refaccionesStock.filter((refaccion) => refaccion.existencia < refaccion.minimo).length,
    },
    embudo: embudo
      .map((fila) => ({ estado: fila.estado, total: fila._count._all }))
      .sort((a, b) => b.total - a.total),
    serieDiaria: [...serie.entries()].map(([fecha, fila]) => ({
      fecha,
      monto: Math.round(fila.monto * 100) / 100,
      pagos: fila.pagos,
    })),
    porMecanico: [...mecanicos.entries()]
      .map(([id, fila]) => ({
        mecanicoId: id || null,
        nombre: id ? (nombres.get(id) ?? "Usuario eliminado") : "Sin asignar",
        entregadas: fila.entregadas,
        manoObra: Math.round(fila.manoObra * 100) / 100,
        refacciones: Math.round(fila.refacciones * 100) / 100,
        total: Math.round((fila.manoObra + fila.refacciones) * 100) / 100,
      }))
      .sort((a, b) => b.total - a.total),
    refacciones: [...refacciones.entries()]
      .map(([refaccionId, fila]) => ({
        refaccionId,
        nombre: fila.nombre,
        cantidad: Math.round(fila.cantidad * 1000) / 1000,
        importe: Math.round(fila.importe * 100) / 100,
        costo: Math.round(fila.costo * 100) / 100,
        margen: Math.round((fila.importe - fila.costo) * 100) / 100,
      }))
      .sort((a, b) => b.importe - a.importe),
    clientesConSaldo: [...saldosPorCliente.entries()]
      .map(([contactoId, fila]) => ({ contactoId, ...fila }))
      .sort((a, b) => b.saldo - a.saldo)
      .slice(0, 10),
    refaccionesBajoMinimo: refaccionesStock
      .filter((refaccion) => refaccion.existencia < refaccion.minimo)
      .map((refaccion) => ({ nombre: refaccion.nombre, existencia: refaccion.existencia, minimo: refaccion.minimo }))
      .sort((a, b) => a.existencia - b.existencia)
      .slice(0, 10),
    ordenes: ordenesPeriodo.map((orden) => {
      const pagado = orden.pagos.reduce((total, pago) => total + Number(pago.monto), 0);
      return {
        id: String(orden.id),
        numero: String(orden.numero),
        fecha: fechaLocal(orden.createdAt, ZONA_TALLER),
        cliente: orden.vehiculo.contacto.nombre,
        vehiculo: `${orden.vehiculo.marca} ${orden.vehiculo.modelo}`,
        placa: orden.vehiculo.placa,
        estado: orden.estado,
        mecanico: orden.mecanicoId ? (nombres.get(String(orden.mecanicoId)) ?? "") : "",
        total: Math.round(Number(orden.total) * 100) / 100,
        pagado: Math.round(pagado * 100) / 100,
        saldo: Math.round(Math.max(0, Number(orden.total) - pagado) * 100) / 100,
      };
    }),
  };
}
