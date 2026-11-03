import { orgActual } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { transaccionTenant } from "@/lib/retail-db";
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

type SaldoPendiente = { contacto_id: bigint; nombre: string; saldo: number };

/** Solo las órdenes con saldo (no canceladas), agregadas en SQL: no depende del historial total. */
function saldosPendientes(tx: Prisma.TransactionClient) {
  return tx.$queryRaw<SaldoPendiente[]>`
    SELECT v.contacto_id, c.nombre, (o.total - COALESCE(p.pagado, 0))::float8 AS saldo
    FROM taller_ordenes o
    JOIN taller_vehiculos v ON v.id = o.vehiculo_id AND v.org_id = o.org_id
    JOIN contactos c ON c.id = v.contacto_id AND c.org_id = v.org_id
    LEFT JOIN (SELECT orden_id, SUM(monto) AS pagado FROM taller_pagos GROUP BY orden_id) p ON p.orden_id = o.id
    WHERE o.estado <> 'cancelado' AND o.total > COALESCE(p.pagado, 0)`;
}

type EntregaFila = { id: bigint; mecanico_id: bigint | null; total: number; created_at: Date; entregado_at: Date };
type ImporteMecanico = { mecanico_id: bigint | null; tipo: string; importe: number };
type RefaccionFila = { refaccion_id: bigint; nombre: string; cantidad: number; importe: number; costo: number };
type PagoDia = { dia: string; monto: number; pagos: number };
type MetodoCobro = { metodo: string; monto: number; pagos: number };
type AnticipoResumen = { monto: number; pagos: number };
type OrdenCsv = {
  id: bigint; numero: bigint; created_at: Date; estado: string; total: number; mecanico_id: bigint | null;
  marca: string; modelo: string; placa: string; cliente: string; pagado: number;
};

export type ReporteTaller = Awaited<ReturnType<typeof reportesTaller>>;

/**
 * Todo se agrega en SQL (una transacción con RLS): el costo depende del periodo, no del historial,
 * y no se arman listas IN con miles de ids (Postgres responde "stack depth limit exceeded").
 * `incluirOrdenes` trae el detalle por orden; solo lo necesita el CSV.
 */
export async function reportesTaller(desde: string, hasta: string, opciones: { incluirOrdenes?: boolean } = {}) {
  const periodo = periodoReporte(desde, hasta);
  const { gte, lt } = rangoReporte(periodo.desde, periodo.hasta);
  const orgId = await orgActual();
  if (orgId == null) throw new Error("Reporte sin organización");

  const datos = await transaccionTenant(orgId, async (tx) => {
    const [{ n: ingresadas }] = await tx.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM taller_ordenes WHERE created_at >= ${gte} AND created_at < ${lt}`;
    const [{ n: canceladas }] = await tx.$queryRaw<{ n: number }[]>`
      SELECT count(DISTINCT orden_id)::int AS n FROM taller_orden_cambios
      WHERE estado = 'cancelado' AND creado_at >= ${gte} AND creado_at < ${lt}`;
    const entregas = await tx.$queryRaw<EntregaFila[]>`
      WITH ent AS (
        SELECT orden_id, MAX(creado_at) AS entregado_at FROM taller_orden_cambios
        WHERE estado = 'entregado' AND creado_at >= ${gte} AND creado_at < ${lt} GROUP BY orden_id)
      SELECT o.id, o.mecanico_id, o.total::float8 AS total, o.created_at, ent.entregado_at
      FROM ent JOIN taller_ordenes o ON o.id = ent.orden_id`;
    const importesMecanico = await tx.$queryRaw<ImporteMecanico[]>`
      WITH ent AS (
        SELECT DISTINCT orden_id FROM taller_orden_cambios
        WHERE estado = 'entregado' AND creado_at >= ${gte} AND creado_at < ${lt})
      SELECT o.mecanico_id, c.tipo, SUM(c.cantidad * c.precio_unitario)::float8 AS importe
      FROM ent JOIN taller_ordenes o ON o.id = ent.orden_id
      JOIN taller_orden_conceptos c ON c.orden_id = o.id AND c.org_id = o.org_id
      GROUP BY o.mecanico_id, c.tipo`;
    const refacciones = await tx.$queryRaw<RefaccionFila[]>`
      WITH ent AS (
        SELECT DISTINCT orden_id FROM taller_orden_cambios
        WHERE estado = 'entregado' AND creado_at >= ${gte} AND creado_at < ${lt})
      SELECT c.refaccion_id, COALESCE(r.nombre, 'Refacción eliminada') AS nombre,
             SUM(c.cantidad)::float8 AS cantidad, SUM(c.cantidad * c.precio_unitario)::float8 AS importe,
             SUM(c.cantidad * COALESCE(r.costo, 0))::float8 AS costo
      FROM ent JOIN taller_orden_conceptos c ON c.orden_id = ent.orden_id
      LEFT JOIN taller_refacciones r ON r.id = c.refaccion_id AND r.org_id = c.org_id
      WHERE c.tipo = 'refaccion' AND c.refaccion_id IS NOT NULL
      GROUP BY c.refaccion_id, r.nombre`;
    const pagosPorDia = await tx.$queryRaw<PagoDia[]>`
      SELECT to_char((created_at AT TIME ZONE ${ZONA_TALLER})::date, 'YYYY-MM-DD') AS dia,
             SUM(monto)::float8 AS monto, count(*)::int AS pagos
      FROM taller_pagos WHERE created_at >= ${gte} AND created_at < ${lt} GROUP BY 1`;
    const [anticipos] = await tx.$queryRaw<AnticipoResumen[]>`
      SELECT COALESCE(SUM(monto), 0)::float8 AS monto, count(*)::int AS pagos
      FROM taller_pagos WHERE tipo = 'anticipo' AND created_at >= ${gte} AND created_at < ${lt}`;
    const porMetodo = await tx.$queryRaw<MetodoCobro[]>`
      SELECT metodo, SUM(monto)::float8 AS monto, count(*)::int AS pagos
      FROM taller_pagos WHERE created_at >= ${gte} AND created_at < ${lt} GROUP BY metodo ORDER BY monto DESC`;
    const [{ n: enReparacionSinAnticipo }] = await tx.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM taller_ordenes o
      WHERE o.estado = 'en_reparacion' AND NOT EXISTS (
        SELECT 1 FROM taller_pagos p WHERE p.orden_id = o.id AND p.tipo = 'anticipo')`;
    const ordenes = opciones.incluirOrdenes
      ? await tx.$queryRaw<OrdenCsv[]>`
          SELECT o.id, o.numero, o.created_at, o.estado, o.total::float8 AS total, o.mecanico_id,
                 v.marca, v.modelo, v.placa, c.nombre AS cliente, COALESCE(p.pagado, 0)::float8 AS pagado
          FROM taller_ordenes o
          JOIN taller_vehiculos v ON v.id = o.vehiculo_id AND v.org_id = o.org_id
          JOIN contactos c ON c.id = v.contacto_id AND c.org_id = v.org_id
          LEFT JOIN (SELECT orden_id, SUM(monto) AS pagado FROM taller_pagos GROUP BY orden_id) p ON p.orden_id = o.id
          WHERE o.created_at >= ${gte} AND o.created_at < ${lt} ORDER BY o.created_at DESC`
      : [];
    const saldos = await saldosPendientes(tx);
    const recordatorios = await tx.tallerRecordatorio.findMany({
      where: { estado: "pendiente" },
      select: { proximaFecha: true, proximoKm: true, vehiculo: { select: { kilometraje: true } } },
    });
    const embudo = await tx.tallerOrden.groupBy({ by: ["estado"], _count: { _all: true } });
    const refaccionesStock = await tx.tallerRefaccion.findMany({ select: { nombre: true, existencia: true, minimo: true } });
    const idsMecanicos = new Set<string>();
    for (const fila of [...entregas, ...importesMecanico, ...ordenes]) if (fila.mecanico_id) idsMecanicos.add(String(fila.mecanico_id));
    const nombres = new Map(
      (await tx.usuario.findMany({ where: { id: { in: [...idsMecanicos].map(BigInt) } }, select: { id: true, nombre: true } }))
        .map((usuario) => [String(usuario.id), usuario.nombre]),
    );
    return { ingresadas, canceladas, entregas, importesMecanico, refacciones, pagosPorDia, ordenes, saldos, recordatorios, embudo, refaccionesStock, nombres, anticipos, porMetodo, enReparacionSinAnticipo };
  });

  const { entregas, nombres } = datos;
  const redondear = (valor: number) => Math.round(valor * 100) / 100;
  const ingresosCobrados = datos.pagosPorDia.reduce((suma, fila) => suma + fila.monto, 0);
  const porCobrar = datos.saldos.reduce((suma, fila) => suma + fila.saldo, 0);
  const ordenesAbiertas = datos.embudo
    .filter((fila) => !["entregado", "cancelado"].includes(fila.estado))
    .reduce((suma, fila) => suma + fila._count._all, 0);
  const ticketPromedio = entregas.length ? entregas.reduce((suma, orden) => suma + orden.total, 0) / entregas.length : 0;
  const tiempos = entregas
    .map((orden) => new Date(orden.entregado_at).getTime() - new Date(orden.created_at).getTime())
    .filter((valor) => valor >= 0);
  const tiempoPromedioEntregaDias = tiempos.length
    ? Math.round((tiempos.reduce((suma, valor) => suma + valor, 0) / tiempos.length / 86_400_000) * 10) / 10
    : null;

  const mecanicos = new Map<string, { entregadas: number; manoObra: number; refacciones: number }>();
  const filaMecanico = (id: bigint | null) => {
    const clave = id === null ? "" : String(id);
    const fila = mecanicos.get(clave) ?? { entregadas: 0, manoObra: 0, refacciones: 0 };
    mecanicos.set(clave, fila);
    return fila;
  };
  for (const orden of entregas) filaMecanico(orden.mecanico_id).entregadas += 1;
  for (const fila of datos.importesMecanico) {
    const destino = filaMecanico(fila.mecanico_id);
    if (fila.tipo === "mano_obra") destino.manoObra += fila.importe;
    else destino.refacciones += fila.importe;
  }

  const serie = new Map<string, { monto: number; pagos: number }>();
  for (let fecha = periodo.desde; fecha <= periodo.hasta; fecha = sumarDias(fecha, 1)) serie.set(fecha, { monto: 0, pagos: 0 });
  for (const fila of datos.pagosPorDia) if (serie.has(fila.dia)) serie.set(fila.dia, { monto: fila.monto, pagos: fila.pagos });

  const hoy = hoyTaller();
  const recordatoriosVencidos = datos.recordatorios.filter(
    (recordatorio) =>
      (recordatorio.proximaFecha !== null && fechaLocal(recordatorio.proximaFecha, ZONA_TALLER) < hoy) ||
      (recordatorio.proximoKm !== null && recordatorio.proximoKm <= recordatorio.vehiculo.kilometraje),
  ).length;

  const saldosPorCliente = new Map<string, { nombre: string; ordenes: number; saldo: number }>();
  for (const fila of datos.saldos) {
    const clave = String(fila.contacto_id);
    const acumulado = saldosPorCliente.get(clave) ?? { nombre: fila.nombre, ordenes: 0, saldo: 0 };
    acumulado.ordenes += 1;
    acumulado.saldo += fila.saldo;
    saldosPorCliente.set(clave, acumulado);
  }

  return {
    periodo,
    resumen: {
      ingresadas: datos.ingresadas,
      entregadas: entregas.length,
      canceladas: datos.canceladas,
      ordenesAbiertas,
      ticketPromedio: redondear(ticketPromedio),
      ingresosCobrados: redondear(ingresosCobrados),
      porCobrar: redondear(porCobrar),
      tiempoPromedioEntregaDias,
      recordatoriosVencidos,
      piezasBajoMinimo: datos.refaccionesStock.filter((refaccion) => refaccion.existencia < refaccion.minimo).length,
      anticiposRecibidos: redondear(datos.anticipos.monto),
      anticiposPagos: datos.anticipos.pagos,
      ordenesSinAnticipo: datos.enReparacionSinAnticipo,
    },
    cobradoPorMetodo: datos.porMetodo.map((fila) => ({ metodo: fila.metodo, monto: redondear(fila.monto), pagos: fila.pagos })),
    embudo: datos.embudo.map((fila) => ({ estado: fila.estado, total: fila._count._all })).sort((a, b) => b.total - a.total),
    serieDiaria: [...serie.entries()].map(([fecha, fila]) => ({ fecha, monto: redondear(fila.monto), pagos: fila.pagos })),
    porMecanico: [...mecanicos.entries()]
      .map(([id, fila]) => ({
        mecanicoId: id || null,
        nombre: id ? (nombres.get(id) ?? "Usuario eliminado") : "Sin asignar",
        entregadas: fila.entregadas,
        manoObra: redondear(fila.manoObra),
        refacciones: redondear(fila.refacciones),
        total: redondear(fila.manoObra + fila.refacciones),
      }))
      .sort((a, b) => b.total - a.total),
    refacciones: datos.refacciones
      .map((fila) => ({
        refaccionId: String(fila.refaccion_id),
        nombre: fila.nombre,
        cantidad: Math.round(fila.cantidad * 1000) / 1000,
        importe: redondear(fila.importe),
        costo: redondear(fila.costo),
        margen: redondear(fila.importe - fila.costo),
      }))
      .sort((a, b) => b.importe - a.importe),
    clientesConSaldo: [...saldosPorCliente.entries()]
      .map(([contactoId, fila]) => ({ contactoId, ...fila }))
      .sort((a, b) => b.saldo - a.saldo)
      .slice(0, 10),
    refaccionesBajoMinimo: datos.refaccionesStock
      .filter((refaccion) => refaccion.existencia < refaccion.minimo)
      .map((refaccion) => ({ nombre: refaccion.nombre, existencia: refaccion.existencia, minimo: refaccion.minimo }))
      .sort((a, b) => a.existencia - b.existencia)
      .slice(0, 10),
    ordenes: datos.ordenes.map((orden) => ({
      id: String(orden.id),
      numero: String(orden.numero),
      fecha: fechaLocal(orden.created_at, ZONA_TALLER),
      cliente: orden.cliente,
      vehiculo: `${orden.marca} ${orden.modelo}`,
      placa: orden.placa,
      estado: orden.estado,
      mecanico: orden.mecanico_id ? (nombres.get(String(orden.mecanico_id)) ?? "") : "",
      total: redondear(orden.total),
      pagado: redondear(orden.pagado),
      saldo: redondear(Math.max(0, orden.total - orden.pagado)),
    })),
  };
}
