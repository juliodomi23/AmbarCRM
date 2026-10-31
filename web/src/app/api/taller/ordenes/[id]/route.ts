import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { transaccionTenant } from "@/lib/retail-db";
import { serializar } from "@/lib/serialize";

type Props = { params: Promise<{ id: string }> };
const permitidas: Record<string, string[]> = { recibido: ["diagnostico", "cancelado"], diagnostico: ["esperando_aprobacion", "en_reparacion", "cancelado"], esperando_aprobacion: ["diagnostico", "en_reparacion", "cancelado"], en_reparacion: ["listo", "cancelado"], listo: ["entregado", "en_reparacion"], entregado: [], cancelado: [] };
const texto = (v: unknown) => String(v ?? "").trim();
function parseConceptos(value: unknown) {
  if (!Array.isArray(value) || value.length > 100) return null;
  const out: { tipo: string; descripcion: string; cantidad: number; precioUnitario: number }[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const c = item as Record<string, unknown>, tipo = texto(c.tipo), descripcion = texto(c.descripcion), cantidad = Number(c.cantidad), precioUnitario = Number(c.precioUnitario);
    if (!(tipo === "mano_obra" || tipo === "refaccion") || !descripcion || !Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 100000 || !Number.isFinite(precioUnitario) || precioUnitario < 0 || precioUnitario > 100000000) return null;
    out.push({ tipo, descripcion, cantidad, precioUnitario });
  }
  return out;
}
export const GET = conModulo("taller", {}, async (_sesion, _req: NextRequest, props: Props) => {
  const id = BigInt((await props.params).id);
  if (id <= 0n) return NextResponse.json({ error: "Orden inválida" }, { status: 400 });
  const orden = await db.tallerOrden.findUnique({ where: { id }, include: { vehiculo: { include: { contacto: true } }, conceptos: true, cambios: { orderBy: { creadoAt: "asc" } } } });
  return orden ? NextResponse.json(serializar({ orden })) : NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
});

export const PATCH = conModulo("taller", {}, async (sesion, req: NextRequest, props: Props) => {
  const id = BigInt((await props.params).id), body = await req.json().catch(() => null);
  if (id <= 0n || !body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const version = Number(body.version);
  if (!Number.isSafeInteger(version) || version < 1) return NextResponse.json({ error: "Versión inválida" }, { status: 400 });
  const result = await transaccionTenant(sesion.orgId!, async (tx) => {
    const [actual] = await tx.$queryRaw<{ id: bigint; estado: string; version: number; vehiculoId: bigint }[]>`SELECT id, estado, version, vehiculo_id AS "vehiculoId" FROM taller_ordenes WHERE id = ${id} FOR UPDATE`;
    if (!actual) return { error: "Orden no encontrada", status: 404 } as const;
    if (actual.version !== version) return { error: "La orden cambió desde que la abriste. Recarga y vuelve a intentar.", status: 409 } as const;
    const siguiente = body.estado === undefined ? actual.estado : texto(body.estado);
    if (siguiente !== actual.estado && !permitidas[actual.estado]?.includes(siguiente)) return { error: `No se permite cambiar de ${actual.estado} a ${siguiente}`, status: 409 } as const;
    const data: Prisma.TallerOrdenUpdateInput = {};
    if (body.estado !== undefined) data.estado = siguiente;
    if (body.diagnostico !== undefined) data.diagnostico = texto(body.diagnostico).slice(0, 5000);
    if (body.mecanicoId !== undefined) data.mecanicoId = body.mecanicoId ? BigInt(String(body.mecanicoId)) : null;
    if (body.fechaPromesa !== undefined) { const f = body.fechaPromesa ? new Date(String(body.fechaPromesa)) : null; if (f && !Number.isFinite(+f)) return { error: "Fecha promesa inválida", status: 400 } as const; data.fechaPromesa = f; }
    let total: number | undefined;
    if (body.conceptos !== undefined) {
      const conceptos = parseConceptos(body.conceptos);
      if (!conceptos) return { error: "Conceptos inválidos", status: 400 } as const;
      total = conceptos.reduce((sum, c) => sum + Math.round(c.cantidad * c.precioUnitario * 100) / 100, 0);
      data.total = new Prisma.Decimal(total);
      await tx.tallerOrdenConcepto.deleteMany({ where: { ordenId: id } });
      if (conceptos.length) await tx.tallerOrdenConcepto.createMany({ data: conceptos.map((c) => ({ ordenId: id, tipo: c.tipo, descripcion: c.descripcion, cantidad: new Prisma.Decimal(c.cantidad), precioUnitario: new Prisma.Decimal(c.precioUnitario) })) });
    }
    await tx.tallerOrden.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
    if (siguiente !== actual.estado) await tx.tallerOrdenCambio.create({ data: { ordenId: id, estado: siguiente, userId: sesion.userId } });
    const orden = await tx.tallerOrden.findUnique({ where: { id }, include: { vehiculo: { include: { contacto: true } }, conceptos: true, cambios: { orderBy: { creadoAt: "asc" } } } });
    return { orden } as const;
  });
  return "error" in result ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json(serializar(result));
});
