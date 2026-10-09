import crypto from "node:crypto";
import { Prisma, type EstadoCita, type ServicioReserva } from "@prisma/client";
import { db, dbRaw, runWithOrg } from "@/lib/db";
import { transaccionTenant } from "@/lib/retail-db";
import { calcularHorarios, diaSemana, instanteLocal, sumarDias, ventanasDelDia } from "@/lib/reservas/horarios";

/** Estados de cita que ocupan el horario del especialista. */
export const ESTADOS_OCUPAN: EstadoCita[] = ["programada", "confirmada", "en_sala", "completada"];
export const SIN_PREFERENCIA = "cualquiera";

export type ConfigReservas = {
  zona: string;
  anticipacionMin: number;
  ventanaDias: number;
  granularidadMin: number;
  maxPorTelefono: number;
};

const entre = (valor: unknown, min: number, max: number, defecto: number) => {
  const n = Number(valor);
  return Number.isInteger(n) && n >= min && n <= max ? n : defecto;
};

/** Configuración del módulo con valores seguros por defecto. */
export function configReservas(config: unknown): ConfigReservas {
  const c = (config ?? {}) as Record<string, unknown>;
  const zona = typeof c.zona === "string" && zonaValida(c.zona) ? c.zona : "America/Mexico_City";
  return {
    zona,
    anticipacionMin: entre(c.anticipacionMin, 0, 10_080, 120),
    ventanaDias: entre(c.ventanaDias, 1, 90, 30),
    granularidadMin: entre(c.granularidadMin, 5, 120, 30),
    maxPorTelefono: entre(c.maxPorTelefono, 1, 20, 3),
  };
}

function zonaValida(zona: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}

/** Empresa con reservas en línea activas para un slug público, o null. Sin sesión: se valida aquí. */
export async function negocioPublico(slug: string) {
  const org = await dbRaw.org.findUnique({ where: { slug }, select: { id: true, activo: true, nombre: true } });
  if (!org?.activo) return null;
  const modulo = await runWithOrg(org.id, () =>
    db.moduloOrg.findFirst({ where: { clave: "reservas_en_linea", activo: true }, select: { config: true } }),
  );
  return modulo ? { orgId: org.id, nombre: org.nombre, config: configReservas(modulo.config) } : null;
}

/** Especialistas activos que dan el servicio, en orden estable. */
export async function doctoresDelServicio(servicioId: bigint) {
  const filas = await db.servicioReservaDoctor.findMany({
    where: { servicioId, doctor: { activo: true } },
    include: { doctor: { select: { id: true, nombre: true } } },
    orderBy: { doctor: { nombre: "asc" } },
  });
  return filas.map((fila) => fila.doctor);
}

/** Horarios libres de un especialista para un servicio en un día (zona del negocio). */
export async function horariosDeDoctor(
  cfg: ConfigReservas,
  servicio: Pick<ServicioReserva, "duracionMin" | "bufferMin">,
  doctorId: bigint,
  fecha: string,
  ahora = new Date(),
) {
  const [reglas, excepciones] = await Promise.all([
    db.horarioDoctor.findMany({ where: { doctorId, diaSemana: diaSemana(fecha) } }),
    db.excepcionHorario.findMany({ where: { doctorId, fecha: new Date(`${fecha}T00:00:00Z`) } }),
  ]);
  const ventanas = ventanasDelDia(reglas, excepciones);
  if (ventanas.length === 0) return [];
  // Margen de un día a cada lado: una ventana local puede cruzar la medianoche UTC.
  const desde = instanteLocal(sumarDias(fecha, -1), 0, cfg.zona);
  const hasta = instanteLocal(sumarDias(fecha, 2), 0, cfg.zona);
  const ocupados = await db.cita.findMany({
    where: { doctorId, estado: { in: ESTADOS_OCUPAN }, inicio: { lt: hasta }, fin: { gt: desde } },
    select: { inicio: true, fin: true },
  });
  return calcularHorarios({
    fecha, zona: cfg.zona, ventanas, ocupados, duracionMin: servicio.duracionMin, bufferMin: servicio.bufferMin,
    granularidadMin: cfg.granularidadMin, anticipacionMin: cfg.anticipacionMin, ahora,
  });
}

/** Horarios de cada especialista; la unión es lo que se ofrece a quien no tiene preferencia.
 *  ponytail: una consulta por especialista; con más de ~20 agendables, consolidar en una sola. */
export async function horariosPorDoctor(cfg: ConfigReservas, servicio: ServicioReserva, fecha: string, ids: bigint[]) {
  const pares = await Promise.all(ids.map(async (id) => [String(id), await horariosDeDoctor(cfg, servicio, id, fecha)] as const));
  return new Map(pares);
}

export const unionHorarios = (porDoctor: Map<string, string[]>) => [...new Set([...porDoctor.values()].flat())].sort();

/** Quién puede tomar el horario, del menos ocupado ese día al más ocupado. */
export async function candidatos(cfg: ConfigReservas, porDoctor: Map<string, string[]>, horario: string, fecha: string) {
  const libres = [...porDoctor.entries()].filter(([, horarios]) => horarios.includes(horario)).map(([id]) => id);
  if (libres.length <= 1) return libres;
  const carga = await db.cita.groupBy({
    by: ["doctorId"],
    where: {
      doctorId: { in: libres.map(BigInt) },
      estado: { in: ESTADOS_OCUPAN },
      inicio: { gte: instanteLocal(fecha, 0, cfg.zona), lt: instanteLocal(sumarDias(fecha, 1), 0, cfg.zona) },
    },
    _count: { _all: true },
  });
  const cuenta = new Map(carga.map((fila) => [String(fila.doctorId), fila._count._all]));
  return libres.sort((a, b) => (cuenta.get(a) ?? 0) - (cuenta.get(b) ?? 0));
}

/** Contacto por los últimos 10 dígitos del teléfono; si no existe, se crea. */
export async function contactoPorTelefono(telefono10: string, nombre: string) {
  const existente = await db.contacto.findFirst({ where: { telefono: { endsWith: telefono10 } } });
  if (existente) return existente;
  return db.contacto.create({ data: { nombre, telefono: `52${telefono10}`, fuente: "web" } });
}

/**
 * Crea la cita con el especialista bloqueado (FOR UPDATE) y revisando empalmes dentro de la
 * transacción: dos personas que confirman el mismo horario al mismo tiempo no se duplican.
 * Prueba candidato por candidato; devuelve null si todos se ocuparon.
 */
export async function reservarCita(
  orgId: bigint,
  datos: { servicio: ServicioReserva; candidatos: bigint[]; inicio: Date; contactoId: bigint; notas: string | null },
) {
  const fin = new Date(datos.inicio.getTime() + (datos.servicio.duracionMin + datos.servicio.bufferMin) * 60_000);
  for (const doctorId of datos.candidatos) {
    const cita = await transaccionTenant(orgId, async (tx) => {
      const bloqueado = await tx.$queryRaw<{ id: bigint }[]>(Prisma.sql`SELECT id FROM doctores WHERE id = ${doctorId} AND activo FOR UPDATE`);
      if (bloqueado.length === 0) return null;
      const choque = await tx.cita.count({
        where: { doctorId, estado: { in: ESTADOS_OCUPAN }, inicio: { lt: fin }, fin: { gt: datos.inicio } },
      });
      if (choque > 0) return null;
      return tx.cita.create({
        data: {
          contactoId: datos.contactoId,
          doctorId,
          servicioId: datos.servicio.id,
          titulo: datos.servicio.nombre,
          notas: datos.notas,
          inicio: datos.inicio,
          fin,
          origen: "en_linea",
          tokenGestion: crypto.randomBytes(16).toString("hex"),
        },
        include: { doctor: { select: { nombre: true } } },
      });
    });
    if (cita) return cita;
  }
  return null;
}

/** Empresa dueña de una cita por el token de su enlace público, o null. */
export async function orgDeToken(token: string) {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const [fila] = await dbRaw.$queryRaw<{ org_id: bigint | null }[]>`SELECT resolve_org_by_cita_token(${token}) AS org_id`;
  return fila?.org_id ?? null;
}
