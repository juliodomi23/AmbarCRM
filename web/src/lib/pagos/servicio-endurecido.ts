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

function metadataConflictoResuelto(metadata: Prisma.JsonValue) {
  const actual =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? metadata
      : {};
  const conflicto =
    typeof actual.conflicto === "string" ? actual.conflicto : undefined;
  return {
    ...actual,
    conflicto: null,
    requiereReembolso: false,
    motivoConflicto: null,
    ...(conflicto
      ? {
          conflictoResuelto: conflicto,
          conflictoResueltoAt: new Date().toISOString(),
        }
      : {}),
  } as Prisma.InputJsonObject;
}

async function proveedorPara(orgId: bigint, proveedor?: "mercado_pago" | "stripe" | "mock") {
  try { return await obtenerProveedorPago(orgId, proveedor); }
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

function textoCheckoutVenta(venta: { folio: string; contacto: { nombre: string | null } | null; partidas: { producto: { nombre: string } }[] }) {
  const [primera, ...resto] = venta.partidas.map((p) => p.producto.nombre);
  const concepto = primera ? (resto.length ? `${primera} y ${resto.length} más` : primera) : `Venta ${venta.folio}`;
  const cliente = venta.contacto?.nombre?.trim();
  return {
    titulo: (cliente ? `${concepto} · ${cliente}` : concepto).slice(0, 120),
    descripcion: `Venta ${venta.folio}${cliente ? ` · Cliente: ${cliente}` : ""}`.slice(0, 200),
  };
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

  const venta = await db.venta.findUnique({ where: { id: origenId }, select: {
    id: true, folio: true, total: true, moneda: true, estado: true,
    contacto: { select: { nombre: true } },
    partidas: { select: { producto: { select: { nombre: true } } }, orderBy: { id: "asc" } },
  } });
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
      pagoId: String(pago.id), ...textoCheckoutVenta(venta), monto: pago.monto.toFixed(2), moneda: pago.moneda,
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

async function crearTareaRevision(
  tx: Prisma.TransactionClient,
  pagoId: bigint,
  motivo: string,
) {
  const marca = `[Pago ${pagoId}]`;
  if (!(await tx.tarea.findFirst({ where: { titulo: { startsWith: marca } } }))) {
    await tx.tarea.create({
      data: {
        titulo: `${marca} Revisar incidencia de pago`,
        descripcion: motivo,
      },
    });
  }
}

function decimalSeguro(valor?: string) {
  if (!valor) return null;
  try {
    const decimal = new Prisma.Decimal(valor);
    return decimal.gte(0) ? decimal : null;
  } catch {
    return null;
  }
}

async function aplicarReembolsoAprobado(
  orgId: bigint,
  pagoId: bigint,
  reembolsoId: bigint,
  referencia: string,
) {
  return transaccionTenant(orgId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM pagos_online WHERE id = ${pagoId} FOR UPDATE`;
    const actual = await tx.reembolsoPago.findUnique({
      where: { id: reembolsoId },
    });
    const pago = await tx.pagoOnline.findUnique({ where: { id: pagoId } });
    if (!actual || !pago) throw new ErrorPago("Reembolso no encontrado", 404);
    if (actual.estado === "aprobado") return actual;
    if (actual.estado === "rechazado")
      throw new ErrorPago("El reembolso ya fue rechazado", 409);

    const acumulado = pago.montoReembolsado.plus(actual.monto);
    if (acumulado.gt(pago.monto))
      throw new ErrorPago("El reembolso supera el monto del pago", 409);
    const total = acumulado.equals(pago.monto);
    const reembolso = await tx.reembolsoPago.update({
      where: { id: actual.id },
      data: {
        estado: "aprobado",
        referencia,
        ultimoError: null,
        reintentarAt: null,
      },
    });
    await tx.pagoOnline.update({
      where: { id: pago.id },
      data: {
        montoReembolsado: acumulado,
        estado: total ? "reembolsado" : "aprobado",
        reembolsadoAt: total ? new Date() : null,
        metadata: total ? metadataConflictoResuelto(pago.metadata) : undefined,
      },
    });
    try {
      await tx.eventoPago.create({
        data: {
          pagoId,
          proveedor: pago.proveedor,
          eventoId: `reembolso:${actual.id}:aprobado`,
          tipo: "refund.approved",
          payload: {
            reembolsoId: String(actual.id),
            monto: actual.monto.toFixed(2),
          },
          procesadoAt: new Date(),
        },
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2002"
      )
        throw error;
    }
    return reembolso;
  });
}

export async function procesarEventoPago(
  orgId: bigint,
  proveedor: string,
  evento: EventoPagoProveedor,
) {
  const resultado = await transaccionTenant(orgId, async (tx) => {
    const pagoId = /^\d+$/.test(evento.pagoId) ? BigInt(evento.pagoId) : 0n;
    await tx.$queryRaw`SELECT id FROM pagos_online WHERE id = ${pagoId} FOR UPDATE`;
    const pago = await tx.pagoOnline.findUnique({ where: { id: pagoId } });
    if (!pago || pago.proveedor !== proveedor)
      throw new ErrorPago("Pago no encontrado", 404);

    let registro;
    try {
      registro = await tx.eventoPago.create({
        data: {
          pagoId,
          proveedor,
          eventoId: evento.eventoId,
          tipo: evento.tipo,
          payload: evento.payload,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        return { duplicado: true, pago, requiereReembolso: false };
      throw error;
    }

    const finalizarEvento = () =>
      tx.eventoPago.update({
        where: { id: registro.id },
        data: { procesadoAt: new Date() },
      });

    if (evento.contracargo) {
      const actualizado = await tx.pagoOnline.update({
        where: { id: pago.id },
        data: {
          metadata: metadataCon(pago.metadata, {
            conflicto: "contracargo",
            contracargo: true,
            requiereReembolso: false,
            motivoConflicto: "Mercado Pago reportó un contracargo",
          }),
        },
      });
      await crearTareaRevision(
        tx,
        pago.id,
        "Mercado Pago reportó un contracargo. Revisar el caso en el proveedor.",
      );
      await finalizarEvento();
      return { duplicado: false, rechazado: false, pago: actualizado, requiereReembolso: false };
    }

    const montoCoincide = new Prisma.Decimal(evento.monto).equals(pago.monto);
    const monedaCoincide =
      evento.moneda.toUpperCase() === pago.moneda.toUpperCase();
    if (!montoCoincide || !monedaCoincide) {
      if (["aprobado", "reembolsado"].includes(pago.estado)) {
        const actualizado = await tx.pagoOnline.update({
          where: { id: pago.id },
          data: {
            metadata: metadataCon(pago.metadata, {
              conflicto: "monto_o_moneda_no_coinciden",
              motivoConflicto:
                "Un evento posterior no coincide con el monto o moneda del pago aprobado",
            }),
          },
        });
        await crearTareaRevision(
          tx,
          pago.id,
          "Evento con monto o moneda distintos sobre un pago ya aprobado.",
        );
        await finalizarEvento();
        return { duplicado: false, rechazado: false, pago: actualizado, requiereReembolso: false };
      }
      const rechazado = await tx.pagoOnline.update({
        where: { id: pago.id },
        data: {
          estado: "rechazado",
          metadata: metadataCon(pago.metadata, {
            motivo: "monto_o_moneda_no_coinciden",
          }),
        },
      });
      await finalizarEvento();
      return { duplicado: false, rechazado: true, pago: rechazado, requiereReembolso: false };
    }

    const reportado = decimalSeguro(evento.montoReembolsado);
    if (reportado?.gt(0)) {
      const acumulado = Prisma.Decimal.max(
        pago.montoReembolsado,
        Prisma.Decimal.min(reportado, pago.monto),
      );
      let cubierto = pago.montoReembolsado;
      const reservas = await tx.reembolsoPago.findMany({
        where: { pagoId: pago.id, estado: "pendiente" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      for (const reserva of reservas) {
        const siguiente = cubierto.plus(reserva.monto);
        if (siguiente.gt(acumulado)) break;
        await tx.reembolsoPago.update({
          where: { id: reserva.id },
          data: { estado: "aprobado" },
        });
        cubierto = siguiente;
      }
      const total = acumulado.equals(pago.monto);
      const actualizado = await tx.pagoOnline.update({
        where: { id: pago.id },
        data: {
          montoReembolsado: acumulado,
          estado: total ? "reembolsado" : "aprobado",
          reembolsadoAt: total ? (pago.reembolsadoAt ?? new Date()) : null,
          metadata: total
            ? metadataConflictoResuelto(pago.metadata)
            : undefined,
        },
      });
      await finalizarEvento();
      return { duplicado: false, rechazado: false, pago: actualizado, requiereReembolso: false };
    }

    if (evento.estado === "reembolsado") {
      const actualizado = await tx.pagoOnline.update({
        where: { id: pago.id },
        data: {
          metadata: metadataCon(pago.metadata, {
            conflicto: "reembolso_sin_monto",
            motivoConflicto:
              "El proveedor reportó un reembolso sin informar el monto acumulado",
          }),
        },
      });
      await crearTareaRevision(
        tx,
        pago.id,
        "Verificar en Mercado Pago el monto del reembolso reportado.",
      );
      await finalizarEvento();
      return { duplicado: false, rechazado: false, pago: actualizado, requiereReembolso: false };
    }

    const yaAprobado = ["aprobado", "reembolsado"].includes(pago.estado);
    const estado =
      pago.estado === "reembolsado" || pago.estado === "aprobado"
        ? pago.estado
        : evento.estado;
    let actualizado = await tx.pagoOnline.update({
      where: { id: pago.id },
      data: {
        estado,
        referenciaExterna: evento.referencia || pago.referenciaExterna,
        aprobadoAt:
          estado === "aprobado" ? (pago.aprobadoAt ?? new Date()) : pago.aprobadoAt,
      },
    });

    let requiereReembolso = false;
    let motivoConflicto = "";
    if (!yaAprobado && estado === "aprobado" && pago.origenTipo === "venta") {
      await tx.$queryRaw`SELECT id FROM ventas WHERE id = ${pago.origenId} FOR UPDATE`;
      const venta = await tx.venta.findUnique({
        where: { id: pago.origenId },
        select: { estado: true, total: true },
      });
      if (!venta) {
        requiereReembolso = true;
        motivoConflicto = "La venta asociada ya no existe";
      } else if (venta.estado !== "pendiente" || !venta.total.equals(pago.monto)) {
        requiereReembolso = true;
        motivoConflicto =
          venta.estado !== "pendiente"
            ? `La venta está en estado ${venta.estado}`
            : "El total de la venta cambió después de crear el checkout";
      } else {
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
    }

    if (requiereReembolso) {
      actualizado = await tx.pagoOnline.update({
        where: { id: pago.id },
        data: {
          metadata: metadataCon(actualizado.metadata, {
            conflicto: "venta_no_acreditable",
            requiereReembolso: true,
            motivoConflicto,
          }),
        },
      });
    }
    await finalizarEvento();
    return {
      duplicado: false,
      rechazado: false,
      pago: actualizado,
      requiereReembolso,
      motivoConflicto,
    };
  });

  if (!resultado.duplicado && resultado.requiereReembolso) {
    try {
      await reembolsarPago(
        {
          orgId,
          userId: null,
          rol: "admin",
          puesto: "Administrador",
        },
        resultado.pago.id,
        undefined,
        `auto-conflicto:${resultado.pago.id}`,
      );
    } catch {
      await transaccionTenant(orgId, (tx) =>
        crearTareaRevision(
          tx,
          resultado.pago.id,
          `${"motivoConflicto" in resultado ? resultado.motivoConflicto : "Pago no acreditable"}. El reembolso automático falló.`,
        ),
      );
    }
  }
  return resultado;
}

async function conciliarReembolsosPendientes(
  orgId: bigint,
  proveedor: Awaited<ReturnType<typeof obtenerProveedorPago>>,
  errores: Array<{ orgId: string; pagoId?: string; motivo: string }>,
) {
  const pendientes = await db.reembolsoPago.findMany({
    where: {
      estado: "pendiente",
      pago: { proveedor: proveedor.clave },
      OR: [{ reintentarAt: null }, { reintentarAt: { lte: new Date() } }],
    },
    include: { pago: { select: { referenciaExterna: true, proveedor: true } } },
    take: 50,
  });
  let procesados = 0;
  for (const reembolso of pendientes) {
    try {
      if (!reembolso.pago.referenciaExterna) {
        await registrarErrorReembolso(
          orgId,
          reembolso.pagoId,
          reembolso.id,
          "El pago no tiene referencia externa para conciliar el reembolso",
        );
        continue;
      }
      let consulta;
      if (reembolso.referencia) {
        consulta = await proveedor.consultarReembolso(
          reembolso.pago.referenciaExterna,
          reembolso.referencia,
        );
      } else {
        await db.reembolsoPago.update({
          where: { id: reembolso.id },
          data: { intentos: { increment: 1 } },
        });
        consulta = await proveedor.reembolsar(
          reembolso.pago.referenciaExterna,
          reembolso.monto.toFixed(2),
          reembolso.idempotencyKey,
        );
      }
      if (consulta.estado === "aprobado") {
        await aplicarReembolsoAprobado(
          orgId,
          reembolso.pagoId,
          reembolso.id,
          consulta.referencia,
        );
        procesados++;
      } else if (consulta.estado === "rechazado") {
        await db.reembolsoPago.update({
          where: { id: reembolso.id },
          data: {
            estado: "rechazado",
            referencia: consulta.referencia,
            ultimoError: "El proveedor rechazó el reembolso",
            reintentarAt: null,
          },
        });
        procesados++;
      } else {
        await db.reembolsoPago.update({
          where: { id: reembolso.id },
          data: {
            referencia: consulta.referencia,
            ultimoError: null,
            reintentarAt: new Date(Date.now() + 5 * 60_000),
          },
        });
      }
    } catch (error) {
      const motivo =
        error instanceof Error ? error.message.slice(0, 180) : "error desconocido";
      await registrarErrorReembolso(
        orgId,
        reembolso.pagoId,
        reembolso.id,
        motivo,
      );
      errores.push({
        orgId: String(orgId),
        pagoId: String(reembolso.pagoId),
        motivo,
      });
    }
  }
  return procesados;
}

async function registrarErrorReembolso(
  orgId: bigint,
  pagoId: bigint,
  reembolsoId: bigint,
  motivo: string,
) {
  const actualizado = await db.reembolsoPago.update({
    where: { id: reembolsoId },
    data: {
      ultimoError: motivo.slice(0, 500),
      reintentarAt: new Date(Date.now() + 5 * 60_000),
    },
  });
  await transaccionTenant(orgId, (tx) =>
    crearTareaRevision(
      tx,
      pagoId,
      `No se pudo confirmar el reembolso: ${motivo.slice(0, 180)}. Se reintentará con la misma clave de idempotencia.`,
    ),
  );
  return actualizado;
}

export async function conciliarPendientes() {
  const orgs = await dbRaw.org.findMany({
    where: { activo: true },
    select: { id: true },
  });
  let procesados = 0;
  let reembolsosProcesados = 0;
  const errores: Array<{ orgId: string; pagoId?: string; motivo: string }> = [];
  for (const org of orgs) {
    try {
      await runWithOrg(org.id, async () => {
        if (
          !(await db.moduloOrg.findFirst({
            where: { clave: "pagos_en_linea", activo: true },
          }))
        )
          return;
        const pendientes = await db.pagoOnline.findMany({
          where: { estado: "pendiente", checkoutReferencia: { not: null } },
          take: 50,
        });
        for (const clave of new Set(pendientes.map((pago) => pago.proveedor as "mercado_pago" | "stripe" | "mock"))) {
          let proveedor;
          try { proveedor = await obtenerProveedorPago(org.id, clave); }
          catch (error) { if (error instanceof ErrorConfiguracionPagos) continue; throw error; }
          for (const pago of pendientes.filter((registro) => registro.proveedor === clave)) {
            try {
              const consulta = await proveedor.consultarPago(pago.checkoutReferencia!);
              if (!consulta) continue;
              await procesarEventoPago(org.id, proveedor.clave, { eventoId: `conciliacion:${consulta.referencia}:${consulta.estado}`, tipo: "conciliacion", ...consulta });
              procesados++;
            } catch (error) {
              errores.push({ orgId: String(org.id), pagoId: String(pago.id), motivo: error instanceof Error ? error.message.slice(0, 180) : "error desconocido" });
            }
          }
        }
        const pagosConReembolsos = await db.pagoOnline.findMany({ where: { reembolsos: { some: { estado: "pendiente" } } }, select: { proveedor: true }, distinct: ["proveedor"] });
        for (const registro of pagosConReembolsos) {
          try {
            const proveedor = await obtenerProveedorPago(org.id, registro.proveedor as "mercado_pago" | "stripe" | "mock");
            reembolsosProcesados += await conciliarReembolsosPendientes(org.id, proveedor, errores);
          } catch (error) { if (!(error instanceof ErrorConfiguracionPagos)) throw error; }
        }
      });
    } catch (error) {
      errores.push({
        orgId: String(org.id),
        motivo:
          error instanceof Error ? error.message.slice(0, 180) : "error desconocido",
      });
    }
  }
  return { procesados, reembolsosProcesados, errores };
}

export async function reembolsarPago(
  sesion: SesionPago,
  pagoId: bigint,
  monto?: string,
  idempotencyKey = `refund:${pagoId}:legacy`,
) {
  if (!puedeReembolsar(sesion))
    throw new ErrorPago("No tienes permiso para reembolsar", 403);
  if (!/^[A-Za-z0-9._:-]{12,120}$/.test(idempotencyKey))
    throw new ErrorPago("Clave de idempotencia inválida");
  if (monto !== undefined && !/^\d+(?:\.\d{1,2})?$/.test(monto.trim()))
    throw new ErrorPago("El monto debe ser positivo y tener máximo 2 decimales");

  const reservado = await transaccionTenant(sesion.orgId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM pagos_online WHERE id = ${pagoId} FOR UPDATE`;
    const pago = await tx.pagoOnline.findUnique({ where: { id: pagoId } });
    if (
      !pago?.referenciaExterna ||
      pago.estado === "reembolsado" ||
      !["aprobado"].includes(pago.estado)
    )
      throw new ErrorPago("El pago no se puede reembolsar", 409);
    const existente = await tx.reembolsoPago.findUnique({
      where: {
        orgId_idempotencyKey: { orgId: sesion.orgId, idempotencyKey },
      },
    });
    if (existente) {
      if (existente.pagoId !== pagoId)
        throw new ErrorPago(
          "La clave de idempotencia pertenece a otro reembolso",
          409,
        );
      if (
        monto !== undefined &&
        !existente.monto.equals(new Prisma.Decimal(monto.trim()))
      )
        throw new ErrorPago(
          "La clave de idempotencia pertenece a otro monto de reembolso",
          409,
        );
      return { pago, reembolso: existente };
    }
    const pendientes = await tx.reembolsoPago.aggregate({
      where: { pagoId, estado: "pendiente" },
      _sum: { monto: true },
    });
    const disponible = pago.monto
      .minus(pago.montoReembolsado)
      .minus(pendientes._sum.monto ?? new Prisma.Decimal(0));
    const solicitado = monto ? new Prisma.Decimal(monto.trim()) : disponible;
    if (solicitado.lte(0) || solicitado.gt(disponible))
      throw new ErrorPago("El reembolso supera el monto disponible", 409);
    const reembolso = await tx.reembolsoPago.create({
      data: { pagoId, monto: solicitado, idempotencyKey },
    });
    return { pago, reembolso };
  });

  if (reservado.reembolso.estado === "aprobado") return reservado.reembolso;
  if (reservado.reembolso.estado === "rechazado")
    throw new ErrorPago("El reembolso fue rechazado", 409);

  let proveedor;
  try {
    proveedor = await proveedorPara(sesion.orgId, reservado.pago.proveedor as "mercado_pago" | "stripe" | "mock");
  } catch (error) {
    await registrarErrorReembolso(
      sesion.orgId,
      pagoId,
      reservado.reembolso.id,
      error instanceof Error ? error.message : "Pagos no configurados",
    );
    throw error;
  }
  await db.reembolsoPago.update({
    where: { id: reservado.reembolso.id },
    data: {
      intentos: { increment: 1 },
      ultimoError: null,
      reintentarAt: null,
    },
  });
  let resultado;
  try {
    resultado = await proveedor.reembolsar(
      reservado.pago.referenciaExterna!,
      reservado.reembolso.monto.toFixed(2),
      idempotencyKey,
    );
  } catch (error) {
    return registrarErrorReembolso(
      sesion.orgId,
      pagoId,
      reservado.reembolso.id,
      error instanceof Error ? error.message : "Error de red del proveedor",
    );
  }

  if (resultado.estado === "rechazado") {
    return db.reembolsoPago.update({
      where: { id: reservado.reembolso.id },
      data: {
        estado: "rechazado",
        referencia: resultado.referencia,
        ultimoError: "El proveedor rechazó el reembolso",
        reintentarAt: null,
      },
    });
  }
  if (resultado.estado === "pendiente") {
    return db.reembolsoPago.update({
      where: { id: reservado.reembolso.id },
      data: {
        referencia: resultado.referencia,
        ultimoError: null,
        reintentarAt: new Date(Date.now() + 5 * 60_000),
      },
    });
  }
  return aplicarReembolsoAprobado(
    sesion.orgId,
    pagoId,
    reservado.reembolso.id,
    resultado.referencia,
  );
}
