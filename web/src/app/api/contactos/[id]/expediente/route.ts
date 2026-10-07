import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { moduloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { requireSesion } from "@/lib/session";

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
  const [clientesActivo, pacientesActivo] = await Promise.all([
    moduloActivo("clientes"),
    moduloActivo("pacientes"),
  ]);
  if (!clientesActivo && !pacientesActivo) {
    return {
      respuesta: NextResponse.json({ error: "módulo no activo" }, { status: 404 }),
    };
  }
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

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  const acceso = await validarAcceso(id);
  if ("respuesta" in acceso) return acceso.respuesta;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, string | Date | null> = {};
  for (const campo of CAMPOS_TEXTO) {
    data[campo] = String(body[campo] ?? "").trim() || null;
  }
  const fecha = String(body.fechaNacimiento ?? "");
  const fechaNacimiento = fecha ? new Date(`${fecha}T00:00:00.000Z`) : null;
  if (fechaNacimiento && Number.isNaN(fechaNacimiento.getTime())) {
    return NextResponse.json({ error: "fecha de nacimiento inválida" }, { status: 400 });
  }
  data.fechaNacimiento = fechaNacimiento;
  const expediente = await db.expedientePaciente.upsert({
    where: { contactoId: acceso.contactoId },
    create: { contactoId: acceso.contactoId, ...data },
    update: data,
  });
  return NextResponse.json(serializar({ expediente }));
}

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const { id } = await props.params;
  const acceso = await validarAcceso(id);
  if ("respuesta" in acceso) return acceso.respuesta;
  const body = await req.json().catch(() => ({}));
  const contenido = String(body.contenido ?? "").trim();
  if (!contenido) {
    return NextResponse.json({ error: "La evolución no puede estar vacía" }, { status: 400 });
  }

  const doctorId = aBigInt(String(body.doctorId ?? ""));
  if (doctorId && !(await db.doctor.findUnique({ where: { id: doctorId } }))) {
    return NextResponse.json({ error: "doctor inexistente" }, { status: 400 });
  }
  const citaId = aBigInt(String(body.citaId ?? ""));
  if (
    citaId &&
    !(await db.cita.findFirst({
      where: { id: citaId, contactoId: acceso.contactoId },
    }))
  ) {
    return NextResponse.json({ error: "cita inexistente" }, { status: 400 });
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
