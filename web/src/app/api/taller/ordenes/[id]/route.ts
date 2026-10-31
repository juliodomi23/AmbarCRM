import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { transaccionTenant } from "@/lib/retail-db";
import { serializar } from "@/lib/serialize";
import { ajustarExistenciasTaller, cantidadesRefacciones, ErrorStockTaller } from "@/lib/taller-inventario";
import { calcularTotalTaller, puedeEntregarConSaldo, transicionTallerValida } from "@/lib/taller-reglas";
import { referenciaPropia } from "@/lib/referencias";
import { aBigInt } from "@/lib/ids";

type Props = { params: Promise<{ id: string }> };
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
  const orden = await db.tallerOrden.findUnique({ where: { id }, include: { vehiculo: { include: { contacto: true } }, conceptos: true, cambios: { orderBy: { creadoAt: "asc" } }, fotos: { orderBy: { createdAt: "desc" } }, pagos: { orderBy: { createdAt: "asc" } } } });
  return orden ? NextResponse.json(serializar({ orden })) : NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
});

export const PATCH = conModulo("taller", {}, async (sesion, req: NextRequest, props: Props) => {
  const id = aBigInt((await props.params).id), body = await req.json().catch(() => null);
  if (!id || id <= 0n || !body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const version = Number(body.version);
  if (!Number.isSafeInteger(version) || version < 1) return NextResponse.json({ error: "Versión inválida" }, { status: 400 });
  try {
  const result = await transaccionTenant(sesion.orgId!, async (tx) => {
    const [actual] = await tx.$queryRaw<{ id: bigint; estado: string; version: number; vehiculoId: bigint; total: Prisma.Decimal }[]>`SELECT id, estado, version, vehiculo_id AS "vehiculoId", total FROM taller_ordenes WHERE id = ${id} FOR UPDATE`;
    if (!actual) return { error: "Orden no encontrada", status: 404 } as const;
    if (actual.version !== version) return { error: "La orden cambió desde que la abriste. Recarga y vuelve a intentar.", status: 409 } as const;
    const siguiente = body.estado === undefined ? actual.estado : texto(body.estado);
    if (!transicionTallerValida(actual.estado, siguiente)) return { error: `No se permite cambiar de ${actual.estado} a ${siguiente}`, status: 409 } as const;
    if (siguiente === "entregado") {
      const pagado = await tx.tallerPago.aggregate({ where: { ordenId: id }, _sum: { monto: true } });
      const saldo = new Prisma.Decimal(actual.total).minus(pagado._sum.monto ?? 0);
      if (!puedeEntregarConSaldo(sesion.rol, body.confirmarSaldoPendiente === true, Number(saldo))) return { error: "Hay saldo pendiente. Solo un administrador puede confirmar la entrega con saldo.", status: 409 } as const;
    }
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
      const existentes = await tx.tallerOrdenConcepto.findMany({ where: { ordenId: id }, select: { refaccionId: true, cantidad: true } });
      const anteriores = cantidadesRefacciones(existentes);
      const nuevos = cantidadesRefacciones(normalizados.map((c) => ({ refaccionId: c.refaccionId, cantidad: c.cantidad })));
      const cambiosStock = new Map<string, Prisma.Decimal>();
      for (const key of new Set([...anteriores.keys(), ...nuevos.keys()])) cambiosStock.set(key, (nuevos.get(key) ?? new Prisma.Decimal(0)).minus(anteriores.get(key) ?? 0));
      await ajustarExistenciasTaller(tx, cambiosStock);
      const total = calcularTotalTaller(normalizados);
      data.total = new Prisma.Decimal(total);
      await tx.tallerOrdenConcepto.deleteMany({ where: { ordenId: id } });
      if (normalizados.length) await tx.tallerOrdenConcepto.createMany({ data: normalizados.map((c) => ({ ordenId: id, tipo: c.tipo, descripcion: c.descripcion, cantidad: new Prisma.Decimal(c.cantidad), precioUnitario: new Prisma.Decimal(c.precioUnitario), ...(c.refaccionId ? { refaccionId: c.refaccionId } : {}) })) });
    }
    if (siguiente === "cancelado" && actual.estado !== "cancelado") {
      const existentes = await tx.tallerOrdenConcepto.findMany({ where: { ordenId: id }, select: { refaccionId: true, cantidad: true } });
      const devoluciones = new Map([...cantidadesRefacciones(existentes)].map(([key, cantidad]) => [key, cantidad.negated()]));
      await ajustarExistenciasTaller(tx, devoluciones);
    }
    await tx.tallerOrden.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
    if (siguiente !== actual.estado) await tx.tallerOrdenCambio.create({ data: { ordenId: id, estado: siguiente, userId: sesion.userId } });
    const orden = await tx.tallerOrden.findUnique({ where: { id }, include: { vehiculo: { include: { contacto: true } }, conceptos: true, cambios: { orderBy: { creadoAt: "asc" } }, fotos: { orderBy: { createdAt: "desc" } }, pagos: { orderBy: { createdAt: "asc" } } } });
    return { orden } as const;
  });
  return "error" in result ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json(serializar(result));
  } catch (error) {
    if (error instanceof ErrorStockTaller) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
});
