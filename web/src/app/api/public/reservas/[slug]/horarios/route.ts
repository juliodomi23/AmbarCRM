import { NextRequest, NextResponse } from "next/server";
import { db, runWithOrg } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { fechaLocal, fechaValida, sumarDias } from "@/lib/reservas/horarios";
import { errorPublico, limitarIp } from "@/lib/reservas/publico";
import {
  doctoresDelServicio,
  horariosDeDoctor,
  horariosPorDoctor,
  negocioPublico,
  SIN_PREFERENCIA,
  unionHorarios,
} from "@/lib/reservas/servidor";

export const dynamic = "force-dynamic";

/**
 * GET ?servicio=&doctor=&fecha= → horarios libres de ese día.
 * GET ?servicio=&doctor=&desde= → días con al menos un horario libre (bloques de 14 días).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const limite = limitarIp(req, "consulta", 120, 60_000);
  if (limite) return limite;
  const negocio = await negocioPublico((await params).slug);
  if (!negocio) return errorPublico("Este negocio no tiene reservas en línea", 404);
  const q = req.nextUrl.searchParams;
  const servicioId = aBigInt(q.get("servicio"));
  const doctor = q.get("doctor") ?? SIN_PREFERENCIA;
  if (!servicioId) return errorPublico("Servicio inválido", 400);

  return runWithOrg(negocio.orgId, async () => {
    const servicio = await db.servicioReserva.findFirst({ where: { id: servicioId, activo: true } });
    if (!servicio) return errorPublico("Servicio no disponible", 404);
    const elegibles = (await doctoresDelServicio(servicio.id)).map((d) => d.id);
    const doctorId = doctor === SIN_PREFERENCIA ? null : aBigInt(doctor);
    if (doctor !== SIN_PREFERENCIA && (!doctorId || !elegibles.includes(doctorId))) {
      return errorPublico("Especialista no disponible", 400);
    }
    const horariosDelDia = async (fecha: string) =>
      doctorId
        ? horariosDeDoctor(negocio.config, servicio, doctorId, fecha)
        : unionHorarios(await horariosPorDoctor(negocio.config, servicio, fecha, elegibles));

    const hoy = fechaLocal(new Date(), negocio.config.zona);
    const ultimo = sumarDias(hoy, negocio.config.ventanaDias - 1);
    const fecha = q.get("fecha");
    if (fecha) {
      if (!fechaValida(fecha) || fecha < hoy || fecha > ultimo) return errorPublico("Fecha fuera de la agenda", 400);
      return NextResponse.json({ horarios: await horariosDelDia(fecha) });
    }
    const desde = fechaValida(q.get("desde")) && q.get("desde")! > hoy ? q.get("desde")! : hoy;
    const dias: string[] = [];
    for (let i = 0; i < 14; i++) {
      const dia = sumarDias(desde, i);
      if (dia > ultimo) break;
      if ((await horariosDelDia(dia)).length > 0) dias.push(dia);
    }
    const siguiente = sumarDias(desde, 14);
    return NextResponse.json({ dias, siguiente: siguiente <= ultimo ? siguiente : null });
  });
}
