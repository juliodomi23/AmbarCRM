import { Prisma } from "@prisma/client";
import { db, dbRaw, runWithOrg } from "@/lib/db";
import { transaccionTenant } from "@/lib/retail-db";
import { obtenerProveedorPago } from "@/lib/pagos/proveedor";
import type { EventoPagoProveedor } from "@/lib/pagos/tipos";

export class ErrorPago extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

type SesionPago = {
  orgId: bigint;
  userId: bigint | null;
  rol?: string;
  puesto?: string;
};

function puedeReembolsar(sesion: SesionPago) {
  return (
    sesion.rol === "admin" ||
    ["cajero", "ventas", "encargado de tienda"].includes(
      (sesion.puesto ?? "").toLocaleLowerCase("es-MX"),
    )
  );
}

function baseUrl() {
  return (
    process.env.PAGOS_BASE_URL ??
    process.env.NEXTAUTH_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

export async function crearCheckoutVenta(
  sesion: SesionPago,
  entrada: {
    origenTipo?: unknown;
    origenId?: unknown;
    idempotencyKey?: unknown;
  },
) {
  if (entrada.origenTipo !== "venta")
    throw new ErrorPago(
      "Por ahora el cobro en línea está disponible desde ventas",
    );
  const origenId =
    typeof entrada.origenId === "string" && /^\d+$/.test(entrada.origenId)
      ? BigInt(entrada.origenId)
      : null;
  const idempotencyKey =
    typeof entrada.idempotencyKey === "string"
      ? entrada.idempotencyKey.trim()
      : "";
  if (!origenId || !/^[A-Za-z0-9._:-]{12,120}$/.test(idempotencyKey))
    throw new ErrorPago("Origen o clave de idempotencia inválidos");

  const existente = await db.pagoOnline.findFirst({
    where: { idempotencyKey },
  });
  if (existente?.checkoutUrl) return existente;

  const venta = await db.venta.findUnique({
    where: { id: origenId },
    select: { id: true, folio: true, total: true, moneda: true, estado: true },
  });
  if (!venta || venta.estado === "cancelada")
    throw new ErrorPago("La venta no existe o está cancelada", 404);
  if (venta.total.lte(0))
    throw new ErrorPago("La venta no tiene un total cobrable");
  if (venta.estado === "pagada")
    throw new ErrorPago("La venta ya está pagada", 409);

  const proveedor = await obtenerProveedorPago();
  const pago =
    existente ??
    (await db.pagoOnline.create({
      data: {
        origenTipo: "venta",
        origenId: venta.id,
        proveedor: proveedor.clave,
        monto: venta.total,
        moneda: venta.moneda.toUpperCase(),
        idempotencyKey,
        metadata: { creadoPor: sesion.userId ? String(sesion.userId) : null },
        expiraAt: new Date(Date.now() + 24 * 60 * 60_000),
      },
    }));
  const raiz = baseUrl();
  const expiraAt = pago.expiraAt ?? new Date(Date.now() + 24 * 60 * 60_000);
  try {
    const checkout = await proveedor.crearCheckout({
      pagoId: String(pago.id),
      titulo: `Venta ${venta.folio}`,
      monto: pago.monto.toFixed(2),
      moneda: pago.moneda,
      idempotencyKey,
      urlResultado: `${raiz}/pagos/resultado`,
      urlWebhook: `${raiz}/api/public/pagos/webhook/${proveedor.clave}?org=${sesion.orgId}`,
      expiraAt,
    });
    return db.pagoOnline.update({
      where: { id: pago.id },
      data: {
        checkoutUrl: checkout.url,
        checkoutReferencia: checkout.referencia,
        expiraAt: checkout.expiraAt,
      },
    });
  } catch (error) {
    await db.pagoOnline.update({
      where: { id: pago.id },
      data: {
        metadata: {
          errorCheckout:
            error instanceof Error
              ? error.message.slice(0, 180)
              : "Error del proveedor",
        },
      },
    });
    throw error;
  }
}

export async function procesarEventoPago(
  orgId: bigint,
  proveedor: string,
  evento: EventoPagoProveedor,
) {
  try {
    return await transaccionTenant(orgId, async (tx) => {
      const pagoId = /^\d+$/.test(evento.pagoId) ? BigInt(evento.pagoId) : 0n;
      await tx.$queryRaw`SELECT id FROM pagos_online WHERE id = ${pagoId} FOR UPDATE`;
      const pago = await tx.pagoOnline.findUnique({ where: { id: pagoId } });
      if (!pago || pago.proveedor !== proveedor)
        throw new ErrorPago("Pago no encontrado", 404);
      const duplicado = await tx.eventoPago.findFirst({
        where: { proveedor, eventoId: evento.eventoId },
      });
      if (duplicado) return { duplicado: true, pago };
      const registro = await tx.eventoPago.create({
        data: {
          pagoId: pago.id,
          proveedor,
          eventoId: evento.eventoId,
          tipo: evento.tipo,
          payload: evento.payload,
        },
      });
      const montoCoincide = new Prisma.Decimal(evento.monto).equals(pago.monto);
      const monedaCoincide =
        evento.moneda.toUpperCase() === pago.moneda.toUpperCase();
      if (!montoCoincide || !monedaCoincide) {
        await tx.pagoOnline.update({
          where: { id: pago.id },
          data: {
            estado: "rechazado",
            metadata: { motivo: "monto_o_moneda_no_coinciden" },
          },
        });
        await tx.eventoPago.update({
          where: { id: registro.id },
          data: { procesadoAt: new Date() },
        });
        return { duplicado: false, rechazado: true, pago };
      }

      const estadoActual = pago.estado;
      const estadoSiguiente =
        estadoActual === "reembolsado" ||
        (estadoActual === "aprobado" && evento.estado !== "reembolsado")
          ? estadoActual
          : evento.estado;
      const actualizado = await tx.pagoOnline.update({
        where: { id: pago.id },
        data: {
          estado: estadoSiguiente,
          referenciaExterna: evento.referencia || pago.referenciaExterna,
          aprobadoAt:
            estadoSiguiente === "aprobado"
              ? (pago.aprobadoAt ?? new Date())
              : pago.aprobadoAt,
          reembolsadoAt:
            estadoSiguiente === "reembolsado"
              ? (pago.reembolsadoAt ?? new Date())
              : pago.reembolsadoAt,
        },
      });
      if (estadoSiguiente === "aprobado" && pago.origenTipo === "venta") {
        await tx.venta.update({
          where: { id: pago.origenId },
          data: { estado: "pagada", metodoPago: proveedor },
        });
        await tx.pagoVenta.upsert({
          where: {
            ventaId_metodo: { ventaId: pago.origenId, metodo: proveedor },
          },
          create: {
            ventaId: pago.origenId,
            metodo: proveedor,
            monto: pago.monto,
          },
          update: { monto: pago.monto },
        });
      }
      await tx.eventoPago.update({
        where: { id: registro.id },
        data: { procesadoAt: new Date() },
      });
      return { duplicado: false, rechazado: false, pago: actualizado };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return runWithOrg(orgId, async () => ({
        duplicado: true,
        pago: await db.pagoOnline.findUnique({
          where: { id: BigInt(evento.pagoId) },
        }),
      }));
    }
    throw error;
  }
}

export async function conciliarPendientes() {
  const orgs = await dbRaw.org.findMany({
    where: { activo: true },
    select: { id: true },
  });
  let procesados = 0;
  const errores: string[] = [];
  for (const org of orgs) {
    await runWithOrg(org.id, async () => {
      const modulo = await db.moduloOrg.findFirst({
        where: { clave: "pagos_en_linea", activo: true },
      });
      if (!modulo) return;
      const proveedor = await obtenerProveedorPago();
      const pendientes = await db.pagoOnline.findMany({
        where: { estado: "pendiente", checkoutReferencia: { not: null } },
        take: 50,
      });
      for (const pago of pendientes) {
        try {
          const consulta = await proveedor.consultarPago(
            pago.checkoutReferencia!,
          );
          if (!consulta) continue;
          await procesarEventoPago(org.id, proveedor.clave, {
            eventoId: `conciliacion:${consulta.referencia}:${consulta.estado}`,
            tipo: "conciliacion",
            ...consulta,
          });
          procesados++;
        } catch {
          errores.push(`${org.id}:${pago.id}`);
        }
      }
    });
  }
  return { procesados, errores };
}

export async function reembolsarPago(
  sesion: SesionPago,
  pagoId: bigint,
  monto?: string,
) {
  if (!puedeReembolsar(sesion))
    throw new ErrorPago("No tienes permiso para reembolsar", 403);
  const pago = await db.pagoOnline.findUnique({ where: { id: pagoId } });
  if (!pago || !pago.referenciaExterna)
    throw new ErrorPago("El pago no se puede reembolsar", 409);
  if (pago.estado === "reembolsado") {
    const metadata = pago.metadata as { reembolsoReferencia?: unknown };
    return {
      referencia: String(
        metadata.reembolsoReferencia ?? pago.referenciaExterna,
      ),
      estado: "aprobado" as const,
    };
  }
  if (pago.estado !== "aprobado")
    throw new ErrorPago("El pago no se puede reembolsar", 409);
  const montoDecimal = monto ? new Prisma.Decimal(monto) : undefined;
  if (montoDecimal && (montoDecimal.lte(0) || montoDecimal.gt(pago.monto)))
    throw new ErrorPago("Monto de reembolso inválido");
  const proveedor = await obtenerProveedorPago();
  const resultado = await proveedor.reembolsar(
    pago.referenciaExterna,
    montoDecimal?.toFixed(2),
  );
  if (resultado.estado === "aprobado") {
    const total = !montoDecimal || montoDecimal.equals(pago.monto);
    await db.pagoOnline.update({
      where: { id: pago.id },
      data: {
        estado: total ? "reembolsado" : "aprobado",
        reembolsadoAt: total ? new Date() : null,
        metadata: {
          reembolsoReferencia: resultado.referencia,
          reembolsoMonto: montoDecimal?.toFixed(2) ?? pago.monto.toFixed(2),
          reembolsoParcial: !total,
        },
      },
    });
  }
  return resultado;
}
