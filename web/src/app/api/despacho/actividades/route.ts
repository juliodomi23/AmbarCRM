import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { aBigInt } from "@/lib/ids";
import { exigirGestion, fechaCivil, texto, aFecha, mesValido, sinDatosApelacion } from "@/lib/despacho-api";
import { ESTADOS_DESPACHO, TIPOS_ACTIVIDAD, puedeConfirmarActividadDespacho, puedeVerApelacion, puedeVerTodasActividadesDespacho } from "@/lib/despacho";

function rangoMes(mes: string) {
  const [anio, numero] = mes.split("-").map(Number);
  const siguiente = numero === 12 ? `${anio + 1}-01` : `${anio}-${String(numero + 1).padStart(2, "0")}`;
  return { gte: aFecha(`${mes}-01`), lt: aFecha(`${siguiente}-01`) };
}

export const GET = conModulo("despacho", {}, async (sesion, req: NextRequest) => {
  const params = req.nextUrl.searchParams;
  const estado = params.get("estado");
  const clienteId = aBigInt(params.get("clienteId"));
  const responsableId = aBigInt(params.get("responsableId"));
  const periodo = params.get("periodo");
  const where: Prisma.DespachoActividadWhereInput = {};
  if (estado && ESTADOS_DESPACHO.includes(estado as (typeof ESTADOS_DESPACHO)[number])) where.estado = estado;
  if (clienteId) where.clienteId = clienteId;
  if (responsableId) where.responsableId = responsableId;
  if (periodo && mesValido(periodo)) where.periodo = rangoMes(periodo);
  if (params.get("apelacion") === "pendiente") where.apelacionEstado = "pendiente";
  const modulo = await db.moduloOrg.findFirst({ where: { clave: "despacho", activo: true }, select: { config: true } });
  const identidad = { id: sesion.userId, puesto: sesion.puesto, rol: sesion.rol };
  const puedeVerTodo = puedeVerTodasActividadesDespacho(identidad, modulo?.config);
  const puedeConfirmar = puedeConfirmarActividadDespacho(identidad, modulo?.config);
  const soloApelaciones = params.get("apelacion") === "pendiente";
  if (!puedeVerTodo && !(soloApelaciones && puedeConfirmar)) where.responsableId = sesion.userId;
  const actividades = await db.despachoActividad.findMany({
    where,
    include: {
      cliente: { include: { contacto: { select: { id: true, nombre: true, empresa: true } } } },
      cambios: { orderBy: { creadoAt: "desc" }, take: 1 },
    },
    orderBy: [{ fechaLimite: "asc" }, { id: "asc" }],
    take: 500,
  });
  const visibles = actividades.map((actividad) => puedeVerApelacion(actividad, sesion.userId, puedeConfirmar) ? actividad : sinDatosApelacion(actividad));
  return NextResponse.json(serializar({ actividades: visibles }));
});

export const POST = conModulo("despacho", {}, async (sesion, req: NextRequest) => {
  const bloqueo = exigirGestion(sesion);
  if (bloqueo) return bloqueo;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Datos de la actividad inválidos" }, { status: 400 });
  }
  const clienteId = aBigInt(String(body.clienteId ?? ""));
  if (!clienteId || !(await db.despachoCliente.findFirst({ where: { id: clienteId }, select: { id: true } }))) {
    return NextResponse.json({ error: "Selecciona un cliente de esta organización" }, { status: 400 });
  }
  const titulo = texto(body.titulo).slice(0, 200);
  const periodoCrudo = texto(body.periodo);
  const periodo = /^\d{4}-(0[1-9]|1[0-2])$/.test(periodoCrudo) ? fechaCivil(`${periodoCrudo}-01`) : fechaCivil(periodoCrudo);
  const fechaLimite = fechaCivil(body.fechaLimite);
  if (!titulo || !periodo || !fechaLimite) {
    return NextResponse.json({ error: "Escribe el título y fechas válidas" }, { status: 400 });
  }
  const tipo = texto(body.tipo) || "extraordinaria";
  if (!TIPOS_ACTIVIDAD.includes(tipo as (typeof TIPOS_ACTIVIDAD)[number])) {
    return NextResponse.json({ error: "Tipo de actividad inválido" }, { status: 400 });
  }
  const responsableId = body.responsableId ? aBigInt(String(body.responsableId)) : null;
  if (body.responsableId && !responsableId) return NextResponse.json({ error: "Responsable inválido" }, { status: 400 });
  if (responsableId && !(await db.usuario.findFirst({ where: { id: responsableId, activo: true }, select: { id: true } }))) {
    return NextResponse.json({ error: "Responsable no encontrado" }, { status: 400 });
  }
  const clienteProcesoId = body.clienteProcesoId ? aBigInt(String(body.clienteProcesoId)) : null;
  if (body.clienteProcesoId && !clienteProcesoId) return NextResponse.json({ error: "Proceso del cliente inválido" }, { status: 400 });
  const plantillaActividadId = body.plantillaActividadId ? aBigInt(String(body.plantillaActividadId)) : null;
  if (body.plantillaActividadId && !plantillaActividadId) return NextResponse.json({ error: "Actividad de plantilla inválida" }, { status: 400 });
  const actividad = await db.despachoActividad.create({
    data: {
      clienteId, clienteProcesoId, plantillaActividadId, tipo, titulo,
      periodo: aFecha(periodo), fechaLimite: aFecha(fechaLimite), responsableId,
      notas: texto(body.notas).slice(0, 2000) || null,
    },
    include: { cliente: { include: { contacto: { select: { id: true, nombre: true, empresa: true } } } }, cambios: true },
  });
  return NextResponse.json(serializar({ actividad }), { status: 201 });
});
