import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { requireModuloActivo } from "@/lib/modulos";
import { conErrores } from "@/lib/errores-api";
import { requireSesion } from "@/lib/session";

const DIENTES_VALIDOS = new Set([
  ...Array.from({ length: 8 }, (_, i) => 11 + i),
  ...Array.from({ length: 8 }, (_, i) => 21 + i),
  ...Array.from({ length: 8 }, (_, i) => 31 + i),
  ...Array.from({ length: 8 }, (_, i) => 41 + i),
]);
const ZONAS_VALIDAS = new Set(["vestibular", "lingual", "mesial", "distal", "oclusal"]);
const ESTADOS_VALIDOS = new Set(["sano", "caries", "restaurado", "extraido", "corona", "endodoncia"]);

async function manejarPUT(
  req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;
  const bloqueado = await requireModuloActivo("pacientes", sesion);
  if (bloqueado) return bloqueado;

  const contactoId = aBigInt((await props.params).id);
  if (contactoId === null) return NextResponse.json({ error: "contacto inválido" }, { status: 400 });
  const contacto = await db.contacto.findFirst({ where: { id: contactoId }, select: { id: true } });
  if (!contacto) return NextResponse.json({ error: "contacto inexistente" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Datos de odontograma inválidos" }, { status: 400 });
  }
  const diente = body.diente;
  const zona = body.zona;
  const estado = body.estado;
  if (typeof diente !== "number" || !Number.isInteger(diente) || !DIENTES_VALIDOS.has(diente)) {
    return NextResponse.json({ error: "Diente FDI inválido" }, { status: 400 });
  }
  if (typeof zona !== "string" || !ZONAS_VALIDAS.has(zona)) {
    return NextResponse.json({ error: "Zona dental inválida" }, { status: 400 });
  }
  if (typeof estado !== "string" || !ESTADOS_VALIDOS.has(estado)) {
    return NextResponse.json({ error: "Estado dental inválido" }, { status: 400 });
  }

  const expediente = await db.expedientePaciente.upsert({
    where: { contactoId },
    create: { contactoId },
    update: {},
    select: { id: true },
  });
  if (estado === "sano") {
    await db.odontogramaZona.deleteMany({ where: { expedienteId: expediente.id, diente, zona } });
  } else {
    await db.odontogramaZona.upsert({
      where: { expedienteId_diente_zona: { expedienteId: expediente.id, diente, zona } },
      create: { expedienteId: expediente.id, diente, zona, estado, actualizadoPorId: sesion.userId },
      update: { estado, actualizadoPorId: sesion.userId },
    });
  }
  return NextResponse.json({ ok: true });
}

export const PUT = conErrores(manejarPUT);
