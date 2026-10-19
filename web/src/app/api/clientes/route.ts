import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { accesoAgenda } from "@/lib/citas-acceso";
import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { serializar } from "@/lib/serialize";
import { conModulo } from "@/lib/con-modulo";
import { paginacionListado } from "@/lib/paginacion";

function texto(valor: unknown) {
  return String(valor ?? "").trim() || null;
}

function fechaNacimiento(valor: unknown) {
  const fecha = texto(valor);
  if (!fecha) return null;
  const resultado = new Date(`${fecha}T00:00:00.000Z`);
  return Number.isNaN(resultado.getTime()) ? undefined : resultado;
}

function datosExpediente(body: Record<string, unknown>) {
  return {
    fechaNacimiento: fechaNacimiento(body.fechaNacimiento),
    sexo: texto(body.sexo),
    alergias: texto(body.alergias),
    antecedentes: texto(body.antecedentes),
    medicamentos: texto(body.medicamentos),
    observaciones: texto(body.observaciones),
  };
}

const incluirCliente = (where: Prisma.CitaWhereInput) => ({
  expediente: true,
  citas: {
    where,
    include: { doctor: true },
    orderBy: { inicio: "desc" as const },
    take: 10,
  },
} satisfies Prisma.ContactoInclude);

export const GET = conModulo("clientes", {}, async (sesion, req: NextRequest) => {
  const acceso = await accesoAgenda(sesion);
  const contactoId = aBigInt(req.nextUrl.searchParams.get("contactoId"));
  const clientes = await db.contacto.findMany({
    where: {
      expediente: { isNot: null },
      id: contactoId ?? undefined,
    },
    include: incluirCliente(acceso.where),
    orderBy: { nombre: "asc" },
    ...paginacionListado(req),
  });
  return NextResponse.json(serializar({ clientes }));
});

export const POST = conModulo("clientes", {}, async (sesion, req: NextRequest) => {
  const acceso = await accesoAgenda(sesion);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const fecha = fechaNacimiento(body.fechaNacimiento);
  if (fecha === undefined) {
    return NextResponse.json({ error: "fecha de nacimiento inválida" }, { status: 400 });
  }
  const expediente = { ...datosExpediente(body), fechaNacimiento: fecha };
  const contactoId = aBigInt(texto(body.contactoId));

  if (body.contactoId && contactoId === null) {
    return NextResponse.json({ error: "contacto inválido" }, { status: 400 });
  }
  if (contactoId) {
    const contacto = await db.contacto.findUnique({ where: { id: contactoId } });
    if (!contacto) {
      return NextResponse.json({ error: "contacto inexistente" }, { status: 404 });
    }
    await db.expedientePaciente.upsert({
      where: { contactoId },
      create: { contactoId, ...expediente },
      update: expediente,
    });
    const cliente = await db.contacto.findUnique({
      where: { id: contactoId },
      include: incluirCliente(acceso.where),
    });
    return NextResponse.json(serializar({ cliente }), { status: 201 });
  }

  const nombre = texto(body.nombre);
  if (!nombre) {
    return NextResponse.json({ error: "El nombre es obligatorio" }, { status: 400 });
  }
  const telefono = texto(body.telefono);
  if (
    telefono &&
    (await db.contacto.findFirst({ where: { telefono }, select: { id: true } }))
  ) {
    return NextResponse.json(
      { error: "Ya existe un contacto con ese teléfono; crea su ficha desde Contactos" },
      { status: 409 },
    );
  }
  const cliente = await db.contacto.create({
    data: {
      nombre,
      telefono,
      email: texto(body.email),
      fuente: "manual",
      responsableId: sesion.userId,
      expediente: { create: expediente },
    },
    include: incluirCliente(acceso.where),
  });
  return NextResponse.json(serializar({ cliente }), { status: 201 });
});
