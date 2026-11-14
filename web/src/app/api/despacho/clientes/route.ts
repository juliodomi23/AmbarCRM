import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { referenciaPropia } from "@/lib/referencias";
import { exigirGestion, texto } from "@/lib/despacho-api";
import { puedeVerAvanceEquipoDespacho, puedeVerTodasActividadesDespacho } from "@/lib/despacho";

export const GET = conModulo("despacho", {}, async (sesion) => {
  const modulo = await db.moduloOrg.findFirst({ where: { clave: "despacho", activo: true }, select: { config: true } });
  const identidad = { id: sesion.userId, puesto: sesion.puesto, rol: sesion.rol };
  const verDetalle = puedeVerTodasActividadesDespacho(identidad, modulo?.config);
  const verAvanceEquipo = puedeVerAvanceEquipoDespacho(identidad, modulo?.config);
  const clientes = await db.despachoCliente.findMany({
    where: verAvanceEquipo ? {} : { actividades: { some: { responsableId: sesion.userId } } },
    include: {
      contacto: { select: { id: true, nombre: true, telefono: true, empresa: true } },
      procesos: { include: { proceso: { select: { id: true, nombre: true, periodicidad: true } } } },
      _count: { select: { actividades: true } },
      ...(!verDetalle ? { actividades: { where: verAvanceEquipo ? {} : { responsableId: sesion.userId }, select: { estado: true, fechaLimite: true, requiereConfirmacion: true, confirmadaAt: true, responsableId: true } } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
  return NextResponse.json(serializar({ clientes }));
});

export const POST = conModulo("despacho", {}, async (sesion, req: NextRequest) => {
  const bloqueo = exigirGestion(sesion);
  if (bloqueo) return bloqueo;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Datos del cliente inválidos" }, { status: 400 });
  }
  const contactoId = await referenciaPropia("contacto", body.contactoId);
  if (!contactoId) return NextResponse.json({ error: "Selecciona un contacto de esta organización" }, { status: 400 });
  const responsableId = await referenciaPropia("usuario", body.responsableId);
  if (responsableId === false) return NextResponse.json({ error: "Responsable no encontrado" }, { status: 400 });
  const rfc = texto(body.rfc).toUpperCase().slice(0, 13) || null;
  const cliente = await db.despachoCliente.create({
    data: { contactoId, responsableId, rfc, notas: texto(body.notas).slice(0, 2000) || null },
    include: { contacto: { select: { id: true, nombre: true, telefono: true, empresa: true } }, procesos: true },
  });
  return NextResponse.json(serializar({ cliente }), { status: 201 });
});
