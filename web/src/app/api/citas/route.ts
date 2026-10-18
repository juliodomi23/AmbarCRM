import { avisosDeCita } from "@/lib/citas-avisos";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { serializar } from "@/lib/serialize";
import { conModulo, type SesionModulo } from "@/lib/con-modulo";
import { paginacionListado } from "@/lib/paginacion";
import { crearCitaInterna, conErroresCita, incluirCita } from "@/lib/citas-servidor";
import { errorTextoCita, fechaEntradaCita } from "@/lib/citas-reglas";
import { configReservasEmpresa } from "@/lib/reservas/servidor";
import { referenciaPropia } from "@/lib/referencias";

export const dynamic = "force-dynamic";

export const GET = conModulo("citas", {}, conErroresCita(async (s: SesionModulo, req: NextRequest) => {
  const parametros = req.nextUrl.searchParams;
  const desde = new Date(parametros.get("desde") ?? Date.now());
  const hasta = parametros.get("hasta")
    ? new Date(parametros.get("hasta")!)
    : new Date(desde.getTime() + 7 * 86400000);
  if (![desde, hasta].every((f) => Number.isFinite(+f) && f.getUTCFullYear() >= 2000 && f.getUTCFullYear() <= 2100) || hasta <= desde || +hasta - +desde > 62 * 86400000) {
    return NextResponse.json({ error: "El rango debe ser mayor que cero y de máximo 62 días, entre 2000 y 2100" }, { status: 400 });
  }
  const contactoTexto = parametros.get("contactoId");
  const contactoId = aBigInt(contactoTexto);
  if (contactoTexto && (contactoId === null || contactoId <= 0 || contactoId > 9223372036854775807n)) {
    return NextResponse.json({ error: "contacto inválido" }, { status: 400 });
  }
  const cursorTexto = parametros.get("cursor");
  const cursor = aBigInt(cursorTexto);
  if (cursorTexto && (!cursor || cursor > 9223372036854775807n)) return NextResponse.json({ error: "Cursor de citas inválido" }, { status: 400 });
  const paginacion = paginacionListado(req);
  const citas = await db.cita.findMany({
    where: {
      inicio: { lt: hasta }, fin: { gt: desde },
      contactoId: contactoId ?? undefined,
    },
    include: incluirCita,
    orderBy: [{ inicio: "asc" }, { id: "asc" }],
    ...paginacion,
  });
  return NextResponse.json(serializar({ citas, siguienteCursor: citas.length === paginacion.take ? String(citas.at(-1)!.id) : null, zona: (await configReservasEmpresa()).zona }));
}));

export const POST = conModulo("citas", {}, conErroresCita(async (s: SesionModulo, req: NextRequest) => {
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object" || Array.isArray(b)) return NextResponse.json({ error: "Datos de cita inválidos" }, { status: 400 });
  const error = errorTextoCita({ titulo: b.titulo, notas: b.notas ?? null });
  if (error) return NextResponse.json({ error }, { status: 400 });
  for (const campo of ["doctorId", "contactoId", "conversacionId", "responsableId", "servicioId"]) {
    if (b[campo] != null && b[campo] !== "") {
      const valor = aBigInt(String(b[campo]));
      if (!valor || valor > 9223372036854775807n) return NextResponse.json({ error: `${campo} inválido` }, { status: 400 });
    }
  }
  const doctorId = b.doctorId ? aBigInt(String(b.doctorId)) : null;
  const inicio = fechaEntradaCita(b.inicio),
    fin = b.fin === undefined ? undefined : fechaEntradaCita(b.fin);
  if (
    !b.contactoId ||
    !String(b.titulo ?? "").trim() ||
    Number.isNaN(+inicio) ||
    (fin !== undefined && (Number.isNaN(+fin) || fin <= inicio))
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
  if (conversacionId && !(await db.conversacion.findFirst({ where: { id: conversacionId, contactoId } }))) {
    return NextResponse.json({ error: "La conversación no pertenece al contacto" }, { status: 400 });
  }
  const cita = await crearCitaInterna(s.orgId!, {
    contactoId, conversacionId, responsableId: responsableId ?? s.userId,
    doctorId, servicioId: b.servicioId ? aBigInt(String(b.servicioId)) : null, titulo: String(b.titulo).trim(), notas: String(b.notas ?? "").trim() || null, inicio, fin,
  });
  return NextResponse.json(serializar({ cita, avisos: await avisosDeCita(cita) }), { status: 201 });
}));
