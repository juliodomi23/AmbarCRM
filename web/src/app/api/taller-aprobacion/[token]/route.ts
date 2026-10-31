import { NextRequest, NextResponse } from "next/server";
import { db, runWithOrg } from "@/lib/db";

function tokenPart(value: string) {
  const match = /^(\d+)-([a-f0-9]{48})$/.exec(value);
  return match ? { orgId: BigInt(match[1]), token: match[2] } : null;
}
async function cargar(value: string) {
  const parsed = tokenPart(value); if (!parsed) return null;
  return runWithOrg(parsed.orgId, async () => {
    const modulo = await db.moduloOrg.findFirst({ where: { clave: "taller", activo: true }, select: { id: true } });
    if (!modulo) return null;
    const orden = await db.tallerOrden.findFirst({ where: { aprobacionToken: parsed.token, estado: "esperando_aprobacion" }, include: { vehiculo: { select: { placa: true, marca: true, modelo: true } }, conceptos: true } });
    return orden ? { parsed, orden } : null;
  });
}
export async function GET(_req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const data = await cargar((await props.params).token);
  if (!data) return NextResponse.json({ error: "Aprobación no disponible" }, { status: 404 });
  return NextResponse.json({ orden: { numero: data.orden.numero, estado: data.orden.estado, vehiculo: data.orden.vehiculo, conceptos: data.orden.conceptos, total: data.orden.total } });
}
export async function POST(req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const data = await cargar((await props.params).token), body = await req.json().catch(() => null);
  if (!data) return NextResponse.json({ error: "Aprobación no disponible" }, { status: 404 });
  if (!body || !["aprobar", "rechazar"].includes(String(body.decision))) return NextResponse.json({ error: "Decisión inválida" }, { status: 400 });
  const nuevoEstado = body.decision === "aprobar" ? "en_reparacion" : "diagnostico";
  return runWithOrg(data.parsed.orgId, async () => {
    const result = await db.tallerOrden.updateMany({ where: { id: data.orden.id, estado: "esperando_aprobacion", aprobacionToken: data.parsed.token }, data: { estado: nuevoEstado, aprobacionToken: null, aprobacionResultado: String(body.decision), aprobadoAt: new Date(), aprobadoMedio: "enlace_publico", version: { increment: 1 } } });
    if (!result.count) return NextResponse.json({ error: "Esta aprobación ya fue respondida" }, { status: 409 });
    await db.tallerOrdenCambio.create({ data: { ordenId: data.orden.id, estado: nuevoEstado, actor: "cliente" } });
    return NextResponse.json({ ok: true, estado: nuevoEstado });
  });
}
