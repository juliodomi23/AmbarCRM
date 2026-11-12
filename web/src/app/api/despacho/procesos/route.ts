import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { exigirGestion, texto } from "@/lib/despacho-api";
import { PERIODICIDADES } from "@/lib/despacho";

export const GET = conModulo("despacho", {}, async () => {
  const procesos = await db.despachoProceso.findMany({
    include: { actividades: { orderBy: [{ orden: "asc" }, { id: "asc" }] }, _count: { select: { clientes: true } } },
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
  });
  return NextResponse.json(serializar({ procesos }));
});

export const POST = conModulo("despacho", {}, async (sesion, req: NextRequest) => {
  const bloqueo = exigirGestion(sesion);
  if (bloqueo) return bloqueo;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Datos del proceso inválidos" }, { status: 400 });
  }
  const nombre = texto(body.nombre).slice(0, 120);
  const periodicidad = texto(body.periodicidad);
  if (!nombre || !PERIODICIDADES.includes(periodicidad as (typeof PERIODICIDADES)[number])) {
    return NextResponse.json({ error: "Escribe un nombre y elige una periodicidad válida" }, { status: 400 });
  }
  const crudas = Array.isArray(body.actividades) ? body.actividades : [];
  if (crudas.length > 100) return NextResponse.json({ error: "Demasiadas actividades" }, { status: 400 });
  const actividades: { nombre: string; diaLimite: number; peso: number; orden: number }[] = [];
  for (const [indice, raw] of crudas.entries()) {
    if (!raw || typeof raw !== "object") return NextResponse.json({ error: "Actividad inválida" }, { status: 400 });
    const dato = raw as Record<string, unknown>;
    const nombreActividad = texto(dato.nombre).slice(0, 160);
    const diaLimite = Number(dato.diaLimite ?? 1);
    const peso = Number(dato.peso ?? 1);
    if (!nombreActividad || !Number.isSafeInteger(diaLimite) || diaLimite < 1 || diaLimite > 31) {
      return NextResponse.json({ error: "Revisa el nombre y el día límite de cada actividad" }, { status: 400 });
    }
    if (!Number.isSafeInteger(peso) || peso < 1 || peso > 100) {
      return NextResponse.json({ error: "El peso de cada actividad debe ser un entero entre 1 y 100" }, { status: 400 });
    }
    actividades.push({ nombre: nombreActividad, diaLimite, peso, orden: Number.isSafeInteger(Number(dato.orden)) ? Number(dato.orden) : indice });
  }
  const proceso = await db.despachoProceso.create({
    data: { nombre, periodicidad, actividades: { create: actividades } },
    include: { actividades: { orderBy: [{ orden: "asc" }, { id: "asc" }] } },
  });
  return NextResponse.json(serializar({ proceso }), { status: 201 });
});
