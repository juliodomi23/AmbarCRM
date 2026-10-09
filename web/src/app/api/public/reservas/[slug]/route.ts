import { NextRequest, NextResponse } from "next/server";
import { db, runWithOrg } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { fechaLocal, fechaValida, sumarDias } from "@/lib/reservas/horarios";
import { errorPublico, limitarIp, telefonoMx } from "@/lib/reservas/publico";
import {
  candidatos,
  contactoPorTelefono,
  doctoresDelServicio,
  horariosDeDoctor,
  horariosPorDoctor,
  negocioPublico,
  reservarCita,
  SIN_PREFERENCIA,
} from "@/lib/reservas/servidor";
import { getAjustes } from "@/lib/services/config";
import { normalizarMarca } from "@/lib/brand";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

/** Datos públicos para la página de reservas: marca, servicios activos y sus especialistas. */
export async function GET(req: NextRequest, { params }: Props) {
  const limite = limitarIp(req, "consulta", 120, 60_000);
  if (limite) return limite;
  const negocio = await negocioPublico((await params).slug);
  if (!negocio) return errorPublico("Este negocio no tiene reservas en línea", 404);
  return runWithOrg(negocio.orgId, async () => {
    const [ajustes, servicios] = await Promise.all([
      getAjustes(),
      db.servicioReserva.findMany({
        where: { activo: true, doctores: { some: { doctor: { activo: true } } } },
        include: { doctores: { where: { doctor: { activo: true } }, include: { doctor: { select: { id: true, nombre: true } } } } },
        orderBy: { nombre: "asc" },
      }),
    ]);
    const marca = normalizarMarca(ajustes);
    return NextResponse.json({
      negocio: { nombre: marca.nombre || negocio.nombre, logo: marca.logo, colorPrimario: marca.colorPrimario },
      zona: negocio.config.zona,
      ventanaDias: negocio.config.ventanaDias,
      servicios: servicios.map((s) => ({
        id: String(s.id), nombre: s.nombre, descripcion: s.descripcion, duracionMin: s.duracionMin, precio: Number(s.precio),
        doctores: s.doctores.map(({ doctor }) => ({ id: String(doctor.id), nombre: doctor.nombre })),
      })),
    });
  });
}

/** Reserva pública. Body: { servicioId, doctorId | "cualquiera", fecha, horario (ISO UTC), nombre, telefono, notas? } */
export async function POST(req: NextRequest, { params }: Props) {
  const limite = limitarIp(req, "reserva", 10, 60 * 60_000);
  if (limite) return limite;
  const negocio = await negocioPublico((await params).slug);
  if (!negocio) return errorPublico("Este negocio no tiene reservas en línea", 404);
  const b = await req.json().catch(() => ({}));
  const nombre = String(b.nombre ?? "").trim().slice(0, 120);
  const telefono = telefonoMx(b.telefono);
  const servicioId = aBigInt(String(b.servicioId ?? ""));
  const inicio = new Date(String(b.horario ?? ""));
  if (!nombre || !servicioId || !fechaValida(b.fecha) || Number.isNaN(+inicio)) return errorPublico("Faltan datos de la reserva", 400);
  if (!telefono) return errorPublico("El teléfono debe tener 10 dígitos", 400);
  if (fechaLocal(inicio, negocio.config.zona) !== b.fecha) return errorPublico("Horario inválido", 400);
  const hoy = fechaLocal(new Date(), negocio.config.zona);
  if (b.fecha < hoy || b.fecha > sumarDias(hoy, negocio.config.ventanaDias - 1)) {
    return errorPublico("Esa fecha está fuera de la agenda", 400);
  }

  return runWithOrg(negocio.orgId, async () => {
    // El enlace es público: sin tope, una sola persona podría llenar la agenda con citas falsas.
    // Se cuentan citas creadas de verdad (no intentos fallidos) en las últimas 24 h.
    const recientes = await db.cita.count({
      where: {
        origen: "en_linea",
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) },
        contacto: { telefono: { endsWith: telefono } },
      },
    });
    if (recientes >= negocio.config.maxPorTelefono) {
      return errorPublico("Ya agendaste varias citas hoy. Si necesitas más, escríbele al negocio.", 429);
    }
    const servicio = await db.servicioReserva.findFirst({ where: { id: servicioId, activo: true } });
    if (!servicio) return errorPublico("Servicio no disponible", 404);
    const elegibles = (await doctoresDelServicio(servicio.id)).map((d) => d.id);
    // Nunca confiar en el navegador: la disponibilidad se recalcula aquí.
    let lista: string[];
    if (b.doctorId === SIN_PREFERENCIA) {
      lista = await candidatos(negocio.config, await horariosPorDoctor(negocio.config, servicio, b.fecha, elegibles), inicio.toISOString(), b.fecha);
    } else {
      const doctorId = aBigInt(String(b.doctorId ?? ""));
      if (!doctorId || !elegibles.includes(doctorId)) return errorPublico("Especialista no disponible", 400);
      const libres = await horariosDeDoctor(negocio.config, servicio, doctorId, b.fecha);
      lista = libres.includes(inicio.toISOString()) ? [String(doctorId)] : [];
    }
    if (lista.length === 0) return errorPublico("Ese horario ya no está disponible, elige otro", 409);

    const contacto = await contactoPorTelefono(telefono, nombre);
    const cita = await reservarCita(negocio.orgId, {
      servicio, candidatos: lista.map(BigInt), inicio, contactoId: contacto.id,
      notas: String(b.notas ?? "").trim().slice(0, 500) || null,
    });
    if (!cita) return errorPublico("Ese horario acaba de ocuparse, elige otro", 409);
    return NextResponse.json(
      { token: cita.tokenGestion, inicio: cita.inicio, especialista: cita.doctor?.nombre ?? null, servicio: servicio.nombre },
      { status: 201 },
    );
  });
}
