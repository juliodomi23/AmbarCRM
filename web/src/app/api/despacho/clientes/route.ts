import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { referenciaPropia } from "@/lib/referencias";
import { exigirGestionDespacho, texto } from "@/lib/despacho-api";
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
  const bloqueo = await exigirGestionDespacho(sesion);
  if (bloqueo) return bloqueo;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Datos del cliente inválidos" }, { status: 400 });
  }
  let contactoId = await referenciaPropia("contacto", body.contactoId);
  if (contactoId === false) return NextResponse.json({ error: "El contacto seleccionado no existe" }, { status: 400 });
  if (!contactoId) {
    const nombre = texto(body.nombre);
    const telefono = texto(body.telefono);
    if (!nombre || !telefono) return NextResponse.json({ error: "Escribe nombre y teléfono del cliente, o elige un contacto existente" }, { status: 400 });
    const contacto = await db.contacto.create({ data: { nombre: nombre.slice(0, 160), telefono: telefono.slice(0, 40), fuente: "manual" } });
    contactoId = contacto.id;
  }
  const responsableId = await referenciaPropia("usuario", body.responsableId);
  if (responsableId === false) return NextResponse.json({ error: "Responsable no encontrado" }, { status: 400 });
  const rfc = texto(body.rfc).toUpperCase().slice(0, 13) || null;
  const cliente = await db.despachoCliente.create({
    data: { contactoId, responsableId, rfc, notas: texto(body.notas).slice(0, 2000) || null },
    include: { contacto: { select: { id: true, nombre: true, telefono: true, empresa: true } }, procesos: true },
  });
  return NextResponse.json(serializar({ cliente }), { status: 201 });
});
