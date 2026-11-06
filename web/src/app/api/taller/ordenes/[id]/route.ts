import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { transaccionTenant } from "@/lib/retail-db";
import { serializar } from "@/lib/serialize";
import { ajustarExistenciasTaller, cantidadesRefacciones, ErrorStockTaller } from "@/lib/taller-inventario";
import { calcularTotalTaller, puedeEntregarConSaldo, transicionTallerValida } from "@/lib/taller-reglas";
import { configTaller, enviarMensajeTaller } from "@/lib/taller-whatsapp";
import { referenciaPropia } from "@/lib/referencias";
import { aBigInt } from "@/lib/ids";

type Props = { params: Promise<{ id: string }> };
class ErrorTotalMenorPagado extends Error {}
const texto = (v: unknown) => String(v ?? "").trim();
function parseConceptos(value: unknown) {
  if (!Array.isArray(value) || value.length > 100) return null;
  const out: { tipo: string; descripcion: string; cantidad: number; precioUnitario: number; refaccionId: bigint | null }[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const c = item as Record<string, unknown>, tipo = texto(c.tipo), descripcion = texto(c.descripcion), cantidad = Number(c.cantidad), precioUnitario = Number(c.precioUnitario);
    if (!(tipo === "mano_obra" || tipo === "refaccion") || !descripcion || !Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 100000 || !Number.isFinite(precioUnitario) || precioUnitario < 0 || precioUnitario > 100000000) return null;
    const refaccionId = c.refaccionId ? aBigInt(String(c.refaccionId)) : null;
    if (c.refaccionId && !refaccionId) return null;
    if ((tipo === "refaccion" && !refaccionId) || (tipo === "mano_obra" && refaccionId)) return null;
    out.push({ tipo, descripcion, cantidad, precioUnitario, refaccionId });
  }
  return out;
}
export const GET = conModulo("taller", {}, async (_sesion, _req: NextRequest, props: Props) => {
  const id = aBigInt((await props.params).id);
  if (!id || id <= 0n) return NextResponse.json({ error: "Orden inválida" }, { status: 400 });
  const orden = await db.tallerOrden.findUnique({ where: { id }, include: { vehiculo: { include: { contacto: true } }, conceptos: true, cambios: { orderBy: { creadoAt: "asc" } }, fotos: { orderBy: { createdAt: "desc" } }, pagos: { orderBy: { createdAt: "asc" } }, notificaciones: { orderBy: { createdAt: "desc" }, take: 20 } } });
  return orden ? NextResponse.json(serializar({ orden })) : NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
});

export const PATCH = conModulo("taller", {}, async (sesion, req: NextRequest, props: Props) => {
  const id = aBigInt((await props.params).id), body = await req.json().catch(() => null);
  if (!id || id <= 0n || !body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const version = Number(body.version);
  if (!Number.isSafeInteger(version) || version < 1) return NextResponse.json({ error: "Versión inválida" }, { status: 400 });
  const pagoFinal = body.pagoFinal === undefined ? null : (body.pagoFinal as Record<string, unknown> | null);
  const montoFinal = pagoFinal ? Number(pagoFinal.monto) : 0;
  const metodoFinal = pagoFinal ? texto(pagoFinal.metodo) : "";
  if (pagoFinal && (!Number.isFinite(montoFinal) || montoFinal <= 0 || montoFinal > 100000000 || !["efectivo", "tarjeta", "transferencia", "otro"].includes(metodoFinal))) return NextResponse.json({ error: "Pago final inválido" }, { status: 400 });
  if (pagoFinal && body.estado !== "entregado") return NextResponse.json({ error: "El pago final solo se registra al entregar" }, { status: 400 });
  try {
  const result = await transaccionTenant(sesion.orgId!, async (tx) => {
    const [actual] = await tx.$queryRaw<{ id: bigint; estado: string; version: number; vehiculoId: bigint; total: Prisma.Decimal; aprobadoAt: Date | null }[]>`SELECT id, estado, version, vehiculo_id AS "vehiculoId", total, aprobado_at AS "aprobadoAt" FROM taller_ordenes WHERE id = ${id} FOR UPDATE`;
    if (!actual) return { error: "Orden no encontrada", status: 404 } as const;
    if (actual.version !== version) return { error: "La orden cambió desde que la abriste. Recarga y vuelve a intentar.", status: 409 } as const;
    let pagoPorRegistrar: { monto: Prisma.Decimal; tipo: string; userId: bigint } | null = null;
    let siguiente = body.estado === undefined ? actual.estado : texto(body.estado);
    if (!transicionTallerValida(actual.estado, siguiente)) return { error: `No se permite cambiar de ${actual.estado} a ${siguiente}`, status: 409 } as const;
    if (siguiente === "entregado") {
      const pagado = await tx.tallerPago.aggregate({ where: { ordenId: id }, _sum: { monto: true } });
      let saldo = new Prisma.Decimal(actual.total).minus(pagado._sum.monto ?? 0);
      // El pago final se inserta al final, ya validado todo: si algo falla antes, no queda ni pago ni cambio de estado.
      if (pagoFinal) {
        if (sesion.userId === null) return { error: "Sesión inválida", status: 401 } as const;
        const pago = new Prisma.Decimal(montoFinal).toDecimalPlaces(2);
        if (pago.greaterThan(saldo)) return { error: "El pago final supera el saldo pendiente", status: 409 } as const;
        pagoPorRegistrar = { monto: pago, tipo: pago.greaterThanOrEqualTo(saldo) ? "liquidacion" : "abono", userId: sesion.userId };
        saldo = saldo.minus(pago);
      }
      if (!puedeEntregarConSaldo(sesion.rol, body.confirmarSaldoPendiente === true, Number(saldo))) return { error: "Hay saldo pendiente. Solo un administrador puede confirmar la entrega con saldo.", status: 409 } as const;
    }
    if (siguiente === "cancelado" && actual.estado !== "cancelado") {
      const pagos = await tx.tallerPago.aggregate({ where: { ordenId: id }, _sum: { monto: true } });
      if ((pagos._sum.monto ?? new Prisma.Decimal(0)).greaterThan(0) && (sesion.rol !== "admin" || body.confirmarCancelacionConPagos !== true)) return { error: "La orden tiene pagos registrados. Solo un administrador puede confirmar la cancelación; los reembolsos se resuelven fuera del sistema.", status: 409 } as const;
    }
    if (body.conceptos !== undefined && actual.estado === "esperando_aprobacion") return { error: "La orden espera la respuesta del cliente. Regrésala a diagnóstico para cambiar conceptos", status: 409 } as const;
    if (body.conceptos !== undefined && ["cancelado", "entregado"].includes(actual.estado)) return { error: "No se pueden cambiar conceptos de una orden cerrada", status: 409 } as const;
    const data: Prisma.TallerOrdenUpdateInput = {};
    if (body.estado !== undefined) data.estado = siguiente;
    if (body.diagnostico !== undefined) data.diagnostico = texto(body.diagnostico).slice(0, 5000);
    if (body.kmEntrada !== undefined) {
      const kmEntrada = Number(body.kmEntrada);
      if (!Number.isSafeInteger(kmEntrada) || kmEntrada < 0) return { error: "Kilometraje de entrada inválido", status: 400 } as const;
      data.kmEntrada = kmEntrada;
      await tx.tallerVehiculo.updateMany({ where: { id: actual.vehiculoId, kilometraje: { lt: kmEntrada } }, data: { kilometraje: kmEntrada, version: { increment: 1 } } });
    }
    if (body.mecanicoId !== undefined) {
      const mecanicoId = await referenciaPropia("usuario", body.mecanicoId);
      if (mecanicoId === false) return { error: "Mecánico no encontrado en esta organización", status: 400 } as const;
      data.mecanicoId = mecanicoId;
    }
    if (body.fechaPromesa !== undefined) { const f = body.fechaPromesa ? new Date(String(body.fechaPromesa)) : null; if (f && !Number.isFinite(+f)) return { error: "Fecha promesa inválida", status: 400 } as const; data.fechaPromesa = f; }
    if (body.conceptos !== undefined) {
      const conceptos = parseConceptos(body.conceptos);
      if (!conceptos) return { error: "Conceptos inválidos", status: 400 } as const;
      const refIds = [...new Set(conceptos.flatMap((c) => c.refaccionId ? [c.refaccionId] : []))];
      const refs = refIds.length ? await tx.tallerRefaccion.findMany({ where: { id: { in: refIds } } }) : [];
      if (refs.length !== refIds.length) return { error: "Una refacción no existe en esta organización", status: 400 } as const;
      const precioRef = new Map(refs.map((r) => [String(r.id), Number(r.precio)]));
      const normalizados = conceptos.map((c) => ({ ...c, precioUnitario: c.refaccionId ? precioRef.get(String(c.refaccionId))! : c.precioUnitario }));
      const existentes = await tx.tallerOrdenConcepto.findMany({ where: { ordenId: id }, select: { tipo: true, descripcion: true, refaccionId: true, cantidad: true, precioUnitario: true } });
      const canon = (items: typeof normalizados | typeof existentes) => items.map((c) => [c.tipo, c.descripcion, String(c.refaccionId ?? ""), Number(c.cantidad), Number(c.precioUnitario)].join("\u001f")).sort().join("\u001e");
      const conceptosCambiaron = canon(existentes) !== canon(normalizados);
      if (conceptosCambiaron && actual.aprobadoAt && ["en_reparacion", "listo"].includes(actual.estado)) {
        siguiente = "diagnostico";
        data.estado = "diagnostico";
        data.aprobadoAt = null;
        data.aprobadoMedio = null;
        data.aprobacionResultado = null;
        data.aprobacionToken = null;
      }
      const total = calcularTotalTaller(normalizados);
      const pagos = await tx.tallerPago.aggregate({ where: { ordenId: id }, _sum: { monto: true } });
      if (new Prisma.Decimal(total).lessThan(pagos._sum.monto ?? 0)) throw new ErrorTotalMenorPagado();
      const anteriores = cantidadesRefacciones(existentes);
      const nuevos = cantidadesRefacciones(normalizados.map((c) => ({ refaccionId: c.refaccionId, cantidad: c.cantidad })));
      const cambiosStock = new Map<string, Prisma.Decimal>();
      for (const key of new Set([...anteriores.keys(), ...nuevos.keys()])) cambiosStock.set(key, (nuevos.get(key) ?? new Prisma.Decimal(0)).minus(anteriores.get(key) ?? 0));
      await ajustarExistenciasTaller(tx, cambiosStock);
      data.total = new Prisma.Decimal(total);
      await tx.tallerOrdenConcepto.deleteMany({ where: { ordenId: id } });
      if (normalizados.length) await tx.tallerOrdenConcepto.createMany({ data: normalizados.map((c) => ({ ordenId: id, tipo: c.tipo, descripcion: c.descripcion, cantidad: new Prisma.Decimal(c.cantidad), precioUnitario: new Prisma.Decimal(c.precioUnitario), ...(c.refaccionId ? { refaccionId: c.refaccionId } : {}) })) });
    }
    if ((siguiente === "diagnostico" && actual.estado === "esperando_aprobacion") || (siguiente === "cancelado" && actual.estado === "esperando_aprobacion")) {
      data.aprobacionToken = null;
      if (siguiente === "diagnostico") { data.aprobadoAt = null; data.aprobadoMedio = null; data.aprobacionResultado = null; }
    }
    if (siguiente === "cancelado" && actual.estado !== "cancelado") {
      const existentes = await tx.tallerOrdenConcepto.findMany({ where: { ordenId: id }, select: { refaccionId: true, cantidad: true } });
      const devoluciones = new Map([...cantidadesRefacciones(existentes)].map(([key, cantidad]) => [key, cantidad.negated()]));
      await ajustarExistenciasTaller(tx, devoluciones);
    }
    if (pagoPorRegistrar) await tx.tallerPago.create({ data: { ordenId: id, monto: pagoPorRegistrar.monto, metodo: metodoFinal, tipo: pagoPorRegistrar.tipo, userId: pagoPorRegistrar.userId } });
    await tx.tallerOrden.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
    if (siguiente !== actual.estado) await tx.tallerOrdenCambio.create({ data: { ordenId: id, estado: siguiente, userId: sesion.userId } });
    const orden = await tx.tallerOrden.findUnique({ where: { id }, include: { vehiculo: { include: { contacto: true } }, conceptos: true, cambios: { orderBy: { creadoAt: "asc" } }, fotos: { orderBy: { createdAt: "desc" } }, pagos: { orderBy: { createdAt: "asc" } }, notificaciones: { orderBy: { createdAt: "desc" }, take: 20 } } });
    return { orden, avisarListo: siguiente === "listo" && siguiente !== actual.estado } as const;
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  revalidatePath("/taller/ordenes", "page");
  revalidatePath(`/taller/ordenes/${id}`, "page");
  const aviso = result.avisarListo ? await avisarClienteListo(id, sesion.userId) : null;
  return NextResponse.json(serializar({ orden: result.orden, aviso }));
  } catch (error) {
    if (error instanceof ErrorTotalMenorPagado) return NextResponse.json({ error: "El total no puede ser menor a lo pagado" }, { status: 409 });
    if (error instanceof ErrorStockTaller) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
});

/** Aviso automático al marcar la orden como lista; nunca tumba el cambio de estado. */
async function avisarClienteListo(ordenId: bigint, usuarioId: bigint | null) {
  const modulo = await db.moduloOrg.findFirst({ where: { clave: "taller", activo: true }, select: { config: true } });
  if (!configTaller(modulo?.config).avisarAlMarcarListo) return null;
  try {
    const resultado = await enviarMensajeTaller(ordenId, "listo", usuarioId);
    return { ok: true, ...resultado };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo avisar al cliente" };
  }
}
