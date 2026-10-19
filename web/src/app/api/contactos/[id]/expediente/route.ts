import { NextRequest, NextResponse } from "next/server";
import { accesoAgendaActual } from "@/lib/citas-acceso";
import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { moduloHabilitado, requireModuloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { requireSesion } from "@/lib/session";
import { conErrores } from "@/lib/errores-api";
import { fechaNacimientoFicha } from "@/lib/fichas";

const CAMPOS_TEXTO = [
  "sexo",
  "alergias",
  "antecedentes",
  "medicamentos",
  "observaciones",
] as const;

async function validarAcceso(id: string) {
  const sesion = await requireSesion();
  if ("error" in sesion) return { respuesta: sesion.error };
  const pacientesHabilitado = await moduloHabilitado("pacientes");
  const modulo = pacientesHabilitado ? "pacientes" : "clientes";
  const bloqueado = await requireModuloActivo(modulo);
  if (bloqueado) return { respuesta: bloqueado };
  const contactoId = aBigInt(id);
  if (contactoId === null) {
    return {
      respuesta: NextResponse.json({ error: "contacto inválido" }, { status: 400 }),
    };
  }
  const contacto = await db.contacto.findUnique({ where: { id: contactoId } });
  if (!contacto) {
    return {
      respuesta: NextResponse.json({ error: "contacto inexistente" }, { status: 404 }),
    };
  }
  return { contactoId, userId: sesion.userId };
}

async function manejarPATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  const acceso = await validarAcceso(id);
  if ("respuesta" in acceso) return acceso.respuesta;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Datos de ficha inválidos" }, { status: 400 });
  const data: Record<string, string | Date | null> = {};
  for (const campo of CAMPOS_TEXTO) {
    if (campo in body) data[campo] = String(body[campo] ?? "").trim() || null;
  }
  const fechaNacimiento = fechaNacimientoFicha(body.fechaNacimiento);
  if (fechaNacimiento === undefined) {
    return NextResponse.json({ error: "fecha de nacimiento inválida" }, { status: 400 });
  }
  if ("fechaNacimiento" in body) data.fechaNacimiento = fechaNacimiento;
  const expediente = await db.expedientePaciente.upsert({
    where: { contactoId: acceso.contactoId },
    create: { contactoId: acceso.contactoId, ...data },
    update: data,
  });
  return NextResponse.json(serializar({ expediente }));
}

async function manejarPOST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  const acceso = await validarAcceso(id);
  if ("respuesta" in acceso) return acceso.respuesta;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Datos de servicio inválidos" }, { status: 400 });
  const contenido = String(body.contenido ?? "").trim();
  if (!contenido) {
    return NextResponse.json({ error: "La evolución no puede estar vacía" }, { status: 400 });
  }

  let doctorId = aBigInt(String(body.doctorId ?? ""));
  if (body.doctorId && !doctorId) return NextResponse.json({ error: "Especialista inválido" }, { status: 400 });
  if (doctorId && !(await db.doctor.findUnique({ where: { id: doctorId } }))) {
    return NextResponse.json({ error: "doctor inexistente" }, { status: 400 });
  }
  const citaId = aBigInt(String(body.citaId ?? ""));
  if (body.citaId && !citaId) return NextResponse.json({ error: "Cita inválida" }, { status: 400 });
  const agenda = await accesoAgendaActual();
  if (citaId) {
    const cita = await db.cita.findFirst({
      where: { id: citaId, contactoId: acceso.contactoId, ...agenda.where },
    });
    if (!cita) return NextResponse.json({ error: "cita inexistente" }, { status: 400 });
    if (doctorId && doctorId !== cita.doctorId) return NextResponse.json({ error: "La especialista debe coincidir con la cita relacionada" }, { status: 400 });
    doctorId = cita.doctorId;
  }

  const expediente = await db.expedientePaciente.upsert({
    where: { contactoId: acceso.contactoId },
    create: { contactoId: acceso.contactoId },
    update: {},
  });
  const evolucion = await db.evolucionClinica.create({
    data: {
      expedienteId: expediente.id,
      contenido,
      doctorId,
      citaId,
      registradoPorId: acceso.userId,
    },
    include: { doctor: true, cita: true, registradoPor: true },
  });
  return NextResponse.json(serializar({ evolucion }), { status: 201 });
}

export const PATCH = conErrores(manejarPATCH);
export const POST = conErrores(manejarPOST);
