import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { accesoAgenda } from "@/lib/citas-acceso";
import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { serializar } from "@/lib/serialize";
import { conModulo } from "@/lib/con-modulo";
import { fechaNacimientoFicha, contactosSinFicha } from "@/lib/fichas";
import { telefonoContacto } from "@/lib/reservas/telefono";
import { transaccionTenant } from "@/lib/retail-db";
import { paginacionListado } from "@/lib/paginacion";

function texto(valor: unknown) {
  return String(valor ?? "").trim() || null;
}

function datosExpediente(body: Record<string, unknown>) {
  return {
    fechaNacimiento: fechaNacimientoFicha(body.fechaNacimiento),
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
  if (req.nextUrl.searchParams.get("sinFicha") === "1") {
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
    if (q.length > 100) return NextResponse.json({ error: "La búsqueda admite hasta 100 caracteres" }, { status: 400 });
    return NextResponse.json(serializar(await contactosSinFicha(q)));
  }
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
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Datos de ficha inválidos" }, { status: 400 });
  const fecha = fechaNacimientoFicha(body.fechaNacimiento);
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
    if (await db.expedientePaciente.findUnique({ where: { contactoId }, select: { id: true } })) return NextResponse.json({ error: "Este contacto ya tiene ficha. Ábrela para consultar o editar sus datos." }, { status: 409 });
    await db.expedientePaciente.create({ data: { contactoId, ...expediente } });
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
  const telefono = texto(body.telefono) ? telefonoContacto(body.telefono) : null;
  if (texto(body.telefono) && !telefono) return NextResponse.json({ error: "Introduce un teléfono válido con lada" }, { status: 400 });
  const resultado = await transaccionTenant(sesion.orgId!, async (tx) => {
    if (telefono) {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`ficha:${sesion.orgId}:${telefono.ultimos10}`}, 0))`;
      const [duplicado] = await tx.$queryRaw<{ existe: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM contactos
        WHERE right(regexp_replace(telefono, '[^0-9]', '', 'g'), 10) = ${telefono.ultimos10}) AS existe`;
      if (duplicado.existe) return null;
    }
    return tx.contacto.create({
      data: {
        nombre,
        telefono: telefono?.completo ?? null,
        email: texto(body.email),
        fuente: "manual",
        responsableId: sesion.userId,
        expediente: { create: expediente },
      },
      include: incluirCliente(acceso.where),
    });
  });
  if (!resultado) return NextResponse.json({ error: "Ese teléfono ya existe. Selecciona el contacto existente para crear su ficha." }, { status: 409 });
  return NextResponse.json(serializar({ cliente: resultado }), { status: 201 });
});
