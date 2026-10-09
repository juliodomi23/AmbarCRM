import { NextRequest, NextResponse } from "next/server";
import { db, runWithOrg } from "@/lib/db";
import { errorPublico, limitarIp } from "@/lib/reservas/publico";
import { configReservas, orgDeToken } from "@/lib/reservas/servidor";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ token: string }> };

async function citaDelToken(token: string) {
  const orgId = await orgDeToken(token);
  if (!orgId) return null;
  const [cita, modulo] = await runWithOrg(orgId, () =>
    Promise.all([
      db.cita.findFirst({
        where: { tokenGestion: token },
        select: { id: true, titulo: true, inicio: true, fin: true, estado: true, doctor: { select: { nombre: true } } },
      }),
      db.moduloOrg.findFirst({ where: { clave: "reservas_en_linea" }, select: { config: true } }),
    ]),
  );
  return cita ? { orgId, cita, zona: configReservas(modulo?.config).zona } : null;
}

/** Detalle de la cita para quien tiene el enlace (sin datos personales del cliente). */
export async function GET(req: NextRequest, { params }: Props) {
  const limite = limitarIp(req, "cita", 60, 60_000);
  if (limite) return limite;
  const encontrada = await citaDelToken((await params).token);
  if (!encontrada) return errorPublico("Cita no encontrada", 404);
  const { cita, zona } = encontrada;
  return NextResponse.json({
    servicio: cita.titulo, inicio: cita.inicio, fin: cita.fin, estado: cita.estado, especialista: cita.doctor?.nombre ?? null, zona,
  });
}

/** Cancelar desde el enlace. Body: { accion: "cancelar" }. Solo antes de que empiece. */
export async function POST(req: NextRequest, { params }: Props) {
  const limite = limitarIp(req, "cita", 60, 60_000);
  if (limite) return limite;
  const body = await req.json().catch(() => ({}));
  if (body.accion !== "cancelar") return errorPublico("Acción inválida", 400);
  const encontrada = await citaDelToken((await params).token);
  if (!encontrada) return errorPublico("Cita no encontrada", 404);
  const { orgId, cita } = encontrada;
  if (!["programada", "confirmada"].includes(cita.estado)) return errorPublico("Esta cita ya no se puede cancelar", 409);
  if (cita.inicio <= new Date()) return errorPublico("La cita ya empezó; escríbele al negocio", 409);
  await runWithOrg(orgId, () => db.cita.update({ where: { id: cita.id }, data: { estado: "cancelada" } }));
  return NextResponse.json({ ok: true, estado: "cancelada" });
}
