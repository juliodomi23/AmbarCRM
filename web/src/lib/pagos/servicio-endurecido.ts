import { Prisma } from "@prisma/client";
import { db, dbRaw, runWithOrg } from "@/lib/db";
import { transaccionTenant } from "@/lib/retail-db";
import { ErrorConfiguracionPagos, obtenerProveedorPago } from "@/lib/pagos/proveedor";
import type { EventoPagoProveedor } from "@/lib/pagos/tipos";

export class ErrorPago extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

type SesionPago = { orgId: bigint; userId: bigint | null; rol?: string; puesto?: string };

export function puedeReembolsar(sesion: SesionPago) {
  return sesion.rol === "admin" || ["cajero", "ventas", "encargado de tienda", "encargado"].includes((sesion.puesto ?? "").toLocaleLowerCase("es-MX"));
}

function baseUrl() {
  return (process.env.PAGOS_BASE_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

function metadataCon(metadata: Prisma.JsonValue, datos: Record<string, unknown>) {
  const actual = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata : {};
  return { ...actual, ...datos } as Prisma.InputJsonObject;
}

async function proveedorPara(orgId: bigint) {
  try { return await obtenerProveedorPago(orgId); }
  catch (error) {
    if (error instanceof ErrorConfiguracionPagos) throw new ErrorPago(error.message, error.status);
    throw error;
  }
}

async function esperarCheckout(pagoId: bigint) {
  for (let intento = 0; intento < 4; intento++) {
    const pago = await db.pagoOnline.findUnique({ where: { id: pagoId } });
    if (!pago || pago.checkoutUrl || intento === 3) return pago;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return null;
}

export async function crearCheckoutVenta(sesion: SesionPago, entrada: { origenTipo?: unknown; origenId?: unknown; idempotencyKey?: unknown }) {
  if (entrada.origenTipo !== "venta") throw new ErrorPago("Por ahora el cobro en línea está disponible desde ventas");
  const origenId = typeof entrada.origenId === "string" && /^\d+$/.test(entrada.origenId) ? BigInt(entrada.origenId) : null;
  const idempotencyKey = typeof entrada.idempotencyKey === "string" ? entrada.idempotencyKey.trim() : "";
  if (!origenId || !/^[A-Za-z0-9._:-]{12,120}$/.test(idempotencyKey)) throw new ErrorPago("Origen o clave de idempotencia inválidos");

  const porClave = await db.pagoOnline.findFirst({ where: { idempotencyKey } });
  if (porClave) {
    if (porClave.origenTipo !== "venta" || porClave.origenId !== origenId) throw new ErrorPago("La clave de idempotencia pertenece a otro cobro", 409);
    if (["rechazado", "cancelado"].includes(porClave.estado)) throw new ErrorPago("Usa una clave nueva para reintentar este cobro", 409);
    if (porClave.estado === "pendiente" && (!porClave.expiraAt || porClave.expiraAt > new Date())) return porClave;
  }

  const pendiente = await db.pagoOnline.findFirst({ where: { origenTipo: "venta", origenId, estado: "pendiente" }, orderBy: { createdAt: "desc" } });
  if (pendiente && pendiente.expiraAt && pendiente.expiraAt <= new Date()) {
    await db.pagoOnline.update({ where: { id: pendiente.id }, data: { estado: "cancelado" } });
  } else if (pendiente) return pendiente;

  const venta = await db.venta.findUnique({ where: { id: origenId }, select: { id: true, folio: true, total: true, moneda: true, estado: true } });
  if (!venta || venta.estado === "cancelada") throw new ErrorPago("La venta no existe o está cancelada", 404);
  if (venta.total.lte(0)) throw new ErrorPago("La venta no tiene un total cobrable");
  if (venta.estado !== "pendiente") throw new ErrorPago("La venta ya no admite un cobro nuevo", 409);
  const proveedor = await proveedorPara(sesion.orgId);

  let pago;
  try {
    pago = await db.pagoOnline.create({ data: {
      origenTipo: "venta", origenId: venta.id, proveedor: proveedor.clave, monto: venta.total,
      moneda: venta.moneda.toUpperCase(), idempotencyKey,
      metadata: { creadoPor: sesion.userId ? String(sesion.userId) : null },
      expiraAt: new Date(Date.now() + 24 * 60 * 60_000),
    } });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const existente = await db.pagoOnline.findFirst({ where: { origenTipo: "venta", origenId, estado: "pendiente" }, orderBy: { createdAt: "desc" } });
    if (!existente) throw error;
    return (await esperarCheckout(existente.id)) ?? existente;
  }

  const raiz = baseUrl();
  try {
    const checkout = await proveedor.crearCheckout({
      pagoId: String(pago.id), titulo: `Venta ${venta.folio}`, monto: pago.monto.toFixed(2), moneda: pago.moneda,
      idempotencyKey, urlResultado: `${raiz}/pagos/resultado`,
      urlWebhook: `${raiz}/api/public/pagos/webhook/${proveedor.clave}/${sesion.orgId}`,
      expiraAt: pago.expiraAt ?? new Date(Date.now() + 24 * 60 * 60_000),
    });
    return db.pagoOnline.update({ where: { id: pago.id }, data: { checkoutUrl: checkout.url, checkoutReferencia: checkout.referencia, expiraAt: checkout.expiraAt } });
  } catch (error) {
    await db.pagoOnline.update({ where: { id: pago.id }, data: {
      estado: "cancelado",
      metadata: metadataCon(pago.metadata, { errorCheckout: error instanceof Error ? error.message.slice(0, 180) : "Error del proveedor" }),
    } });
    throw error;
  }
}

async function crearTareaRevision(tx: Prisma.TransactionClient, pagoId: bigint, motivo: string) {
  const marca = `[Pago ${pagoId}]`;
  if (!(await tx.tarea.findFirst({ where: { titulo: { startsWith: marca } } }))) {
    await tx.tarea.create({ data: { titulo: `${marca} Revisar pago no acreditado`, descripcion: motivo } });
  }
}

export async function procesarEventoPago(orgId: bigint, proveedor: string, evento: EventoPagoProveedor) {
  try {
    return await transaccionTenant(orgId, async (tx) => {
      const pagoId = /^\d+$/.test(evento.pagoId) ? BigInt(evento.pagoId) : 0n;
      await tx.$queryRaw`SELECT id FROM pagos_online WHERE id = ${pagoId} FOR UPDATE`;
      const pago = await tx.pagoOnline.findUnique({ where: { id: pagoId } });
      if (!pago || pago.proveedor !== proveedor) throw new ErrorPago("Pago no encontrado", 404);
      if (await tx.eventoPago.findFirst({ where: { proveedor, eventoId: evento.eventoId } })) return { duplicado: true, pago };
      const registro = await tx.eventoPago.create({ data: { pagoId, proveedor, eventoId: evento.eventoId, tipo: evento.tipo, payload: evento.payload } });
      if (!new Prisma.Decimal(evento.monto).equals(pago.monto) || evento.moneda.toUpperCase() !== pago.moneda.toUpperCase()) {
        const rechazado = await tx.pagoOnline.update({ where: { id: pago.id }, data: { estado: "rechazado", metadata: metadataCon(pago.metadata, { motivo: "monto_o_moneda_no_coinciden" }) } });
        await tx.eventoPago.update({ where: { id: registro.id }, data: { procesadoAt: new Date() } });
        return { duplicado: false, rechazado: true, pago: rechazado };
      }
      const yaAprobado = ["aprobado", "reembolsado"].includes(pago.estado);
      const estado = pago.estado === "reembolsado" || (pago.estado === "aprobado" && evento.estado !== "reembolsado") ? pago.estado : evento.estado;
      const actualizado = await tx.pagoOnline.update({ where: { id: pago.id }, data: {
        estado, referenciaExterna: evento.referencia || pago.referenciaExterna,
        aprobadoAt: estado === "aprobado" ? (pago.aprobadoAt ?? new Date()) : pago.aprobadoAt,
        reembolsadoAt: estado === "reembolsado" ? (pago.reembolsadoAt ?? new Date()) : pago.reembolsadoAt,
        montoReembolsado: estado === "reembolsado" ? pago.monto : pago.montoReembolsado,
      } });
      if (!yaAprobado && estado === "aprobado" && pago.origenTipo === "venta") {
        await tx.$queryRaw`SELECT id FROM ventas WHERE id = ${pago.origenId} FOR UPDATE`;
        const venta = await tx.venta.findUnique({ where: { id: pago.origenId }, select: { estado: true, total: true } });
        if (!venta) await crearTareaRevision(tx, pago.id, "La venta asociada ya no existe.");
        else if (venta.estado !== "pendiente" || !venta.total.equals(pago.monto)) {
          await crearTareaRevision(tx, pago.id, venta.estado !== "pendiente" ? `La venta está en estado ${venta.estado}; no se acreditó automáticamente.` : "El total de la venta cambió después de crear el checkout.");
        } else {
          await tx.venta.update({ where: { id: pago.origenId }, data: { estado: "pagada", metodoPago: proveedor } });
          await tx.pagoVenta.create({ data: { ventaId: pago.origenId, metodo: proveedor, monto: pago.monto } });
        }
      }
      await tx.eventoPago.update({ where: { id: registro.id }, data: { procesadoAt: new Date() } });
      return { duplicado: false, rechazado: false, pago: actualizado };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return runWithOrg(orgId, async () => ({ duplicado: true, pago: await db.pagoOnline.findUnique({ where: { id: BigInt(evento.pagoId) } }) }));
    }
    throw error;
  }
}

export async function conciliarPendientes() {
  const orgs = await dbRaw.org.findMany({ where: { activo: true }, select: { id: true } });
  let procesados = 0;
  const errores: Array<{ orgId: string; pagoId?: string; motivo: string }> = [];
  for (const org of orgs) {
    try {
      await runWithOrg(org.id, async () => {
        if (!(await db.moduloOrg.findFirst({ where: { clave: "pagos_en_linea", activo: true } }))) return;
        let proveedor;
        try { proveedor = await obtenerProveedorPago(org.id); }
        catch (error) { if (error instanceof ErrorConfiguracionPagos) return; throw error; }
        const pendientes = await db.pagoOnline.findMany({ where: { estado: "pendiente", checkoutReferencia: { not: null } }, take: 50 });
        for (const pago of pendientes) {
          try {
            const consulta = await proveedor.consultarPago(pago.checkoutReferencia!);
            if (!consulta) continue;
            await procesarEventoPago(org.id, proveedor.clave, { eventoId: `conciliacion:${consulta.referencia}:${consulta.estado}`, tipo: "conciliacion", ...consulta });
            procesados++;
          } catch (error) {
            errores.push({ orgId: String(org.id), pagoId: String(pago.id), motivo: error instanceof Error ? error.message.slice(0, 180) : "error desconocido" });
          }
        }
      });
    } catch (error) {
      errores.push({ orgId: String(org.id), motivo: error instanceof Error ? error.message.slice(0, 180) : "error desconocido" });
    }
  }
  return { procesados, errores };
}

export async function reembolsarPago(sesion: SesionPago, pagoId: bigint, monto?: string, idempotencyKey = `refund:${pagoId}:legacy`) {
  if (!puedeReembolsar(sesion)) throw new ErrorPago("No tienes permiso para reembolsar", 403);
  if (!/^[A-Za-z0-9._:-]{12,120}$/.test(idempotencyKey)) throw new ErrorPago("Clave de idempotencia inválida");
  const reservado = await transaccionTenant(sesion.orgId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM pagos_online WHERE id = ${pagoId} FOR UPDATE`;
    const pago = await tx.pagoOnline.findUnique({ where: { id: pagoId } });
    if (!pago?.referenciaExterna || !["aprobado", "reembolsado"].includes(pago.estado)) throw new ErrorPago("El pago no se puede reembolsar", 409);
    const existente = await tx.reembolsoPago.findUnique({ where: { orgId_idempotencyKey: { orgId: sesion.orgId, idempotencyKey } } });
    if (existente) {
      if (existente.pagoId !== pagoId) throw new ErrorPago("La clave de idempotencia pertenece a otro reembolso", 409);
      return { pago, reembolso: existente };
    }
    const comprometidos = await tx.reembolsoPago.aggregate({ where: { pagoId, estado: { in: ["pendiente", "aprobado"] } }, _sum: { monto: true } });
    const disponible = pago.monto.minus(comprometidos._sum.monto ?? new Prisma.Decimal(0));
    const solicitado = monto ? new Prisma.Decimal(monto) : disponible;
    if (solicitado.lte(0) || solicitado.gt(disponible)) throw new ErrorPago("El reembolso supera el monto disponible", 409);
    const reembolso = await tx.reembolsoPago.create({ data: { pagoId, monto: solicitado, idempotencyKey } });
    return { pago, reembolso };
  });
  if (reservado.reembolso.estado === "aprobado") return reservado.reembolso;
  const proveedor = await proveedorPara(sesion.orgId);
  const resultado = await proveedor.reembolsar(reservado.pago.referenciaExterna!, reservado.reembolso.monto.toFixed(2), idempotencyKey);
  if (resultado.estado !== "aprobado") return reservado.reembolso;
  return transaccionTenant(sesion.orgId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM pagos_online WHERE id = ${pagoId} FOR UPDATE`;
    const actual = await tx.reembolsoPago.findUnique({ where: { id: reservado.reembolso.id } });
    const pago = await tx.pagoOnline.findUnique({ where: { id: pagoId } });
    if (!actual || !pago) throw new ErrorPago("Reembolso no encontrado", 404);
    if (actual.estado === "aprobado") return actual;
    const acumulado = pago.montoReembolsado.plus(actual.monto);
    const total = acumulado.equals(pago.monto);
    const reembolso = await tx.reembolsoPago.update({ where: { id: actual.id }, data: { estado: "aprobado", referencia: resultado.referencia } });
    await tx.pagoOnline.update({ where: { id: pago.id }, data: { montoReembolsado: acumulado, estado: total ? "reembolsado" : "aprobado", reembolsadoAt: total ? new Date() : null } });
    await tx.eventoPago.create({ data: { pagoId, proveedor: pago.proveedor, eventoId: `reembolso:${actual.id}:aprobado`, tipo: "refund.approved", payload: { reembolsoId: String(actual.id), monto: actual.monto.toFixed(2) }, procesadoAt: new Date() } });
    return reembolso;
  });
}
