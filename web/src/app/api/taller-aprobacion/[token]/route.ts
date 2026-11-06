import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db, runWithOrg } from "@/lib/db";
import { configTaller } from "@/lib/taller-mensajes";

function tokenPart(value: string) {
  const match = /^(\d+)-([a-f0-9]{48})$/.exec(value);
  return match ? { orgId: BigInt(match[1]), token: match[2] } : null;
}
async function cargar(value: string, incluirRespondidas = false) {
  const parsed = tokenPart(value); if (!parsed) return null;
  return runWithOrg(parsed.orgId, async () => {
    const modulo = await db.moduloOrg.findFirst({ where: { clave: "taller", activo: true }, select: { id: true, config: true } });
    if (!modulo) return null;
    const orden = await db.tallerOrden.findFirst({ where: { aprobacionToken: parsed.token, ...(incluirRespondidas ? {} : { estado: "esperando_aprobacion" }) }, include: { vehiculo: { select: { placa: true, marca: true, modelo: true } }, conceptos: true, pagos: { select: { tipo: true, monto: true } } } });
    return orden ? { parsed, orden, config: modulo.config } : null;
  });
}
export async function GET(_req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const data = await cargar((await props.params).token);
  if (!data) return NextResponse.json({ error: "Aprobación no disponible" }, { status: 404 });
  const porcentaje = configTaller(data.config).anticipoPorcentaje;
  const anticipo = porcentaje > 0 ? {
    porcentaje,
    sugerido: Math.round(Number(data.orden.total) * porcentaje) / 100,
    recibido: data.orden.pagos.filter((pago) => pago.tipo === "anticipo").reduce((suma, pago) => suma + Number(pago.monto), 0),
  } : null;
  return NextResponse.json({ orden: { numero: data.orden.numero.toString(), estado: data.orden.estado, vehiculo: data.orden.vehiculo, conceptos: data.orden.conceptos.map(({ descripcion, cantidad, precioUnitario }) => ({ descripcion, cantidad, precioUnitario })), total: data.orden.total, anticipo } });
}
export async function POST(req: NextRequest, props: { params: Promise<{ token: string }> }) {
  const data = await cargar((await props.params).token, true), body = await req.json().catch(() => null);
  if (!data) return NextResponse.json({ error: "Aprobación no disponible" }, { status: 404 });
  if (!body || !["aprobar", "rechazar"].includes(String(body.decision))) return NextResponse.json({ error: "Decisión inválida" }, { status: 400 });
  if (data.orden.estado !== "esperando_aprobacion") return NextResponse.json({ error: "Esta aprobación ya fue respondida" }, { status: 409 });
  const nuevoEstado = body.decision === "aprobar" ? "en_reparacion" : "diagnostico";
  return runWithOrg(data.parsed.orgId, async () => {
    const result = await db.tallerOrden.updateMany({ where: { id: data.orden.id, estado: "esperando_aprobacion", aprobacionToken: data.parsed.token }, data: { estado: nuevoEstado, aprobacionResultado: String(body.decision), aprobadoAt: new Date(), aprobadoMedio: "enlace_publico", version: { increment: 1 } } });
    if (!result.count) return NextResponse.json({ error: "Esta aprobación ya fue respondida" }, { status: 409 });
    await db.tallerOrdenCambio.create({ data: { ordenId: data.orden.id, estado: nuevoEstado, actor: "cliente" } });
    revalidatePath("/taller/ordenes", "page");
    revalidatePath(`/taller/ordenes/${data.orden.id}`, "page");
    return NextResponse.json({ ok: true, estado: nuevoEstado });
  });
}
