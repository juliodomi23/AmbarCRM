import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { aBigInt } from "@/lib/ids";
import { aFecha, exigirGestion, fechaCivil, texto } from "@/lib/despacho-api";

const UNIDADES = ["despacho", "refmex"] as const;
const TIPOS = ["ingreso", "costo", "gasto"] as const;

function mesValido(valor: string | null) {
  return valor && /^\d{4}-(0[1-9]|1[0-2])$/.test(valor) ? valor : null;
}

function rangoMes(mes: string) {
  const [anio, numero] = mes.split("-").map(Number);
  return { gte: new Date(Date.UTC(anio, numero - 1, 1)), lt: new Date(Date.UTC(anio, numero, 1)) };
}

function montoDecimal(valor: unknown) {
  const textoMonto = typeof valor === "string" || typeof valor === "number" ? String(valor).trim() : "";
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(textoMonto)) return null;
  const monto = new Prisma.Decimal(textoMonto);
  return monto.gt(0) ? monto : null;
}

function unidadValida(valor: unknown): valor is (typeof UNIDADES)[number] {
  return typeof valor === "string" && UNIDADES.includes(valor as (typeof UNIDADES)[number]);
}

function tipoValido(valor: unknown): valor is (typeof TIPOS)[number] {
  return typeof valor === "string" && TIPOS.includes(valor as (typeof TIPOS)[number]);
}

export const GET = conModulo("despacho", {}, async (sesion, req: NextRequest) => {
  const bloqueo = exigirGestion(sesion);
  if (bloqueo) return bloqueo;
  const params = req.nextUrl.searchParams;
  const mes = mesValido(params.get("mes")) ?? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit" }).format(new Date());
  const unidad = params.get("unidad");
  if (unidad && !unidadValida(unidad)) return NextResponse.json({ error: "Unidad financiera inválida" }, { status: 400 });
  const whereUnidad = unidad ? { unidad } : {};
  const [movimientos, ingresosAbiertos, pagosMes] = await Promise.all([
    db.despachoMovimientoFinanciero.findMany({
      where: { fecha: rangoMes(mes), ...whereUnidad },
      include: {
        cliente: { include: { contacto: { select: { nombre: true, empresa: true } } } },
        pagos: { orderBy: [{ fecha: "desc" }, { id: "desc" }] },
      },
      orderBy: [{ fecha: "desc" }, { id: "desc" }],
      take: 1000,
    }),
    db.despachoMovimientoFinanciero.findMany({
      where: { tipo: "ingreso", ...whereUnidad },
      include: {
        cliente: { include: { contacto: { select: { nombre: true, empresa: true } } } },
        pagos: { select: { monto: true } },
      },
      orderBy: [{ fechaVencimiento: "asc" }, { id: "asc" }],
      take: 3000,
    }),
    db.despachoFinanzaPago.aggregate({
      where: { fecha: rangoMes(mes), ...(unidad ? { movimiento: { unidad } } : {}) },
      _sum: { monto: true },
    }),
  ]);
  const abiertos = ingresosAbiertos
    .map((movimiento) => {
      const pagado = movimiento.pagos.reduce((suma, pago) => suma.plus(pago.monto), new Prisma.Decimal(0));
      return { movimiento, pagado, saldo: movimiento.monto.minus(pagado) };
    })
    .filter((item) => item.saldo.gt(0))
    .map(({ movimiento, pagado, saldo }) => ({
      id: movimiento.id,
      concepto: movimiento.concepto,
      unidad: movimiento.unidad,
      fechaVencimiento: movimiento.fechaVencimiento,
      monto: movimiento.monto,
      pagado,
      saldo,
      clienteId: movimiento.clienteId,
      cliente: movimiento.cliente?.contacto,
      responsableId: movimiento.responsableId,
    }));
  return NextResponse.json(serializar({ mes, movimientos, porCobrar: abiertos, cobradoEnMes: pagosMes._sum.monto ?? new Prisma.Decimal(0) }));
});

export const POST = conModulo("despacho", {}, async (sesion, req: NextRequest) => {
  const bloqueo = exigirGestion(sesion);
  if (bloqueo) return bloqueo;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Datos del movimiento inválidos" }, { status: 400 });
  const unidad = body.unidad;
  const tipo = body.tipo;
  const concepto = texto(body.concepto).slice(0, 200);
  const monto = montoDecimal(body.monto);
  const fecha = fechaCivil(body.fecha);
  const fechaVencimiento = body.fechaVencimiento ? fechaCivil(body.fechaVencimiento) : null;
  const clienteId = body.clienteId ? aBigInt(String(body.clienteId)) : null;
  const responsableId = body.responsableId ? aBigInt(String(body.responsableId)) : null;
  if (!unidadValida(unidad) || !tipoValido(tipo) || !concepto || !monto || !fecha) {
    return NextResponse.json({ error: "Revisa unidad, tipo, concepto, importe y fecha" }, { status: 400 });
  }
  if (tipo === "ingreso" && (!clienteId || !fechaVencimiento)) {
    return NextResponse.json({ error: "Los ingresos por cobrar necesitan cliente y fecha de vencimiento" }, { status: 400 });
  }
  if (body.fechaVencimiento && !fechaVencimiento) return NextResponse.json({ error: "Fecha de vencimiento inválida" }, { status: 400 });
  if (!responsableId || !(await db.usuario.findFirst({ where: { id: responsableId, activo: true }, select: { id: true } }))) {
    return NextResponse.json({ error: "Selecciona una persona responsable activa" }, { status: 400 });
  }
  if (clienteId && !(await db.despachoCliente.findFirst({ where: { id: clienteId, activo: true }, select: { id: true } }))) {
    return NextResponse.json({ error: "El cliente no está activo en esta organización" }, { status: 400 });
  }
  const movimiento = await db.despachoMovimientoFinanciero.create({
    data: { unidad, tipo, concepto, monto, fecha: aFecha(fecha), fechaVencimiento: fechaVencimiento ? aFecha(fechaVencimiento) : null, clienteId, responsableId },
    include: { cliente: { include: { contacto: { select: { nombre: true, empresa: true } } } }, pagos: true },
  });
  return NextResponse.json(serializar({ movimiento }), { status: 201 });
});
