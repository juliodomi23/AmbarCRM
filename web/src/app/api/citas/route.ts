import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { serializar } from "@/lib/serialize";
import { conModulo } from "@/lib/con-modulo";
import { paginacionListado } from "@/lib/paginacion";
import { referenciaPropia } from "@/lib/referencias";

export const dynamic = "force-dynamic";

export const GET = conModulo("citas", {}, async (s, req: NextRequest) => {
  const parametros = req.nextUrl.searchParams;
  const desde = new Date(parametros.get("desde") ?? Date.now());
  const hasta = parametros.get("hasta")
    ? new Date(parametros.get("hasta")!)
    : new Date(desde.getTime() + 7 * 86400000);
  if (Number.isNaN(+desde) || Number.isNaN(+hasta)) {
    return NextResponse.json({ error: "rango de fechas inválido" }, { status: 400 });
  }
  const contactoTexto = parametros.get("contactoId");
  const contactoId = aBigInt(contactoTexto);
  if (contactoTexto && contactoId === null) {
    return NextResponse.json({ error: "contacto inválido" }, { status: 400 });
  }
  const citas = await db.cita.findMany({
    where: {
      inicio: { gte: desde, lt: hasta },
      contactoId: contactoId ?? undefined,
    },
    include: {
      contacto: { include: { expediente: { select: { id: true } } } },
      responsable: true,
      doctor: true,
    },
    orderBy: { inicio: "asc" },
    ...paginacionListado(req),
  });
  return NextResponse.json(serializar({ citas }));
});

export const POST = conModulo("citas", {}, async (s, req: NextRequest) => {
  const b = await req.json().catch(() => ({}));
  const doctorId = b.doctorId ? aBigInt(String(b.doctorId)) : null;
  const inicio = new Date(b.inicio),
    fin = new Date(b.fin);
  if (
    !b.contactoId ||
    !String(b.titulo ?? "").trim() ||
    Number.isNaN(+inicio) ||
    Number.isNaN(+fin) ||
    fin <= inicio
  )
    return NextResponse.json(
      { error: "datos de cita inválidos" },
      { status: 400 },
    );
  if (b.doctorId && doctorId === null) {
    return NextResponse.json({ error: "doctor inválido" }, { status: 400 });
  }
  if (doctorId) {
    const doctor = await db.doctor.findFirst({
      where: { id: doctorId, activo: true },
      select: { id: true },
    });
    if (!doctor) {
      return NextResponse.json({ error: "doctor inexistente o inactivo" }, { status: 400 });
    }
  }
  const [contactoId, conversacionId, responsableId] = await Promise.all([
    referenciaPropia("contacto", b.contactoId),
    referenciaPropia("conversacion", b.conversacionId),
    referenciaPropia("usuario", b.responsableId),
  ]);
  if (!contactoId) {
    return NextResponse.json({ error: "contacto inexistente" }, { status: 400 });
  }
  if (conversacionId === false || responsableId === false) {
    return NextResponse.json(
      { error: "conversación o responsable inexistente" },
      { status: 400 },
    );
  }
  const cita = await db.cita.create({
    data: {
      contactoId,
      conversacionId,
      responsableId: responsableId ?? s.userId,
      doctorId,
      titulo: String(b.titulo).trim(),
      notas: String(b.notas ?? "").trim() || null,
      inicio,
      fin,
    },
    include: {
      contacto: { include: { expediente: { select: { id: true } } } },
      responsable: true,
      doctor: true,
    },
  });
  return NextResponse.json(serializar({ cita }), { status: 201 });
});
