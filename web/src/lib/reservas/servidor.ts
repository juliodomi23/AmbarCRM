import crypto from "node:crypto";
import { Prisma, type EstadoCita, type ServicioReserva } from "@prisma/client";
import { db, dbRaw, runWithOrg } from "@/lib/db";
import { transaccionTenant } from "@/lib/retail-db";
import {
  calcularHorarios,
  diaSemana,
  fechaLocal,
  fechaValida,
  instanteLocal,
  minutosDeHora,
  sumarDias,
  ventanasDelDia,
} from "@/lib/reservas/horarios";

/** Estados de cita que ocupan el horario del especialista. */
export const ESTADOS_OCUPAN: EstadoCita[] = ["programada", "confirmada", "en_sala", "completada"];
export const SIN_PREFERENCIA = "cualquiera";

export class ErrorLimiteTelefono extends Error {}

export async function bloquearAgenda(tx: Prisma.TransactionClient, ids: bigint[], bloquear = true) {
  const ordenados = [...new Set(ids)].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  if (!ordenados.length) return [];
  return tx.$queryRaw<{ id: bigint; activo: boolean }[]>(Prisma.sql`
    SELECT id, activo FROM doctores WHERE id IN (${Prisma.join(ordenados)}) ORDER BY id
    ${bloquear ? Prisma.sql`FOR UPDATE` : Prisma.empty}
  `);
}

export async function hayEmpalme(tx: Prisma.TransactionClient, doctorId: bigint, inicio: Date, fin: Date, excluirCitaId?: bigint) {
  return (await tx.cita.count({ where: {
    doctorId, estado: { in: ESTADOS_OCUPAN }, inicio: { lt: fin }, fin: { gt: inicio },
    ...(excluirCitaId === undefined ? {} : { id: { not: excluirCitaId } }),
  } })) > 0;
}

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

/** La fecha cae entre hoy y el último día agendable (zona del negocio). */
export function fechaEnAgenda(cfg: ConfigReservas, fecha: unknown, ahora = new Date()): fecha is string {
  if (!fechaValida(fecha)) return false;
  const hoy = fechaLocal(ahora, cfg.zona);
  return fecha >= hoy && fecha <= sumarDias(hoy, cfg.ventanaDias - 1);
}

/** Instante UTC de una fecha AAAA-MM-DD y hora HH:MM locales del negocio, o null si la hora es inválida. */
export function inicioDeFechaHora(cfg: ConfigReservas, fecha: string, hora: unknown) {
  const minutos = minutosDeHora(hora);
  return minutos === null || minutos >= 1440 ? null : instanteLocal(fecha, minutos, cfg.zona);
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
    orderBy: [{ doctor: { nombre: "asc" } }, { doctorId: "asc" }],
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
  /** Al reprogramar: la cita que se mueve no debe bloquearse a sí misma. */
  excluirCitaId?: bigint,
) {
  if (!(await db.doctor.findFirst({ where: { id: doctorId, activo: true }, select: { id: true } }))) return [];
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
    where: {
      doctorId,
      estado: { in: ESTADOS_OCUPAN },
      inicio: { lt: hasta },
      fin: { gt: desde },
      ...(excluirCitaId !== undefined ? { id: { not: excluirCitaId } } : {}),
    },
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

/** Configuración de reservas de la empresa actual (valores por defecto si el módulo no está configurado). */
export async function configReservasEmpresa() {
  const modulo = await db.moduloOrg.findFirst({ where: { clave: "reservas_en_linea" }, select: { config: true } });
  return configReservas(modulo?.config);
}

/**
 * Quién puede tomar `inicio`: con profesional pedido, solo él (null si no da el servicio);
 * sin preferencia, los que tengan libre ese horario, del menos al más ocupado.
 */
export async function candidatosParaHorario(
  cfg: ConfigReservas,
  servicio: ServicioReserva,
  elegibles: bigint[],
  doctorId: bigint | null,
  fecha: string,
  inicio: Date,
) {
  if (doctorId === null) {
    return candidatos(cfg, await horariosPorDoctor(cfg, servicio, fecha, elegibles), inicio.toISOString(), fecha);
  }
  if (!elegibles.includes(doctorId)) return null;
  const libres = await horariosDeDoctor(cfg, servicio, doctorId, fecha);
  return libres.includes(inicio.toISOString()) ? [String(doctorId)] : [];
}

/** Contacto por los últimos 10 dígitos del teléfono; si no existe, se crea. */
export async function contactoPorTelefono(telefono10: string, nombre: string) {
  const existente = await db.contacto.findFirst({ where: { telefono: { endsWith: telefono10 } } });
  if (existente) return existente;
  try {
    return await db.contacto.create({ data: { nombre, telefono: `52${telefono10}`, fuente: "web" } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const creado = await db.contacto.findFirst({ where: { telefono: `52${telefono10}` } });
      if (creado) return creado;
    }
    throw error;
  }
}

/**
 * Crea la cita con el especialista bloqueado (FOR UPDATE) y revisando empalmes dentro de la
 * transacción: dos personas que confirman el mismo horario al mismo tiempo no se duplican.
 * Prueba candidato por candidato; devuelve null si todos se ocuparon.
 */
export async function reservarCita(
  orgId: bigint,
  datos: {
    servicio: ServicioReserva;
    candidatos: bigint[];
    inicio: Date;
    contactoId: bigint;
    notas: string | null;
    origen?: string;
    conversacionId?: bigint | null;
    /** Solo la prueba de concurrencia lo apaga, para mostrar qué pasa sin el bloqueo. */
    bloquear?: boolean;
    limiteTelefono?: { telefono: string; maximo: number };
  },
) {
  const fin = new Date(datos.inicio.getTime() + (datos.servicio.duracionMin + datos.servicio.bufferMin) * 60_000);
  for (const doctorId of datos.candidatos) {
    const cita = await transaccionTenant(orgId, async (tx) => {
      if (datos.limiteTelefono) {
        const { telefono, maximo } = datos.limiteTelefono;
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`${orgId}:${telefono}`}, 0))`;
        const recientes = await tx.cita.count({ where: {
          origen: "en_linea", createdAt: { gte: new Date(Date.now() - 86_400_000) }, contacto: { telefono: { endsWith: telefono } },
        } });
        if (recientes >= maximo) throw new ErrorLimiteTelefono("Ya agendaste varias citas hoy. Si necesitas más, escríbele al negocio.");
      }
      const bloqueado = await bloquearAgenda(tx, [doctorId], datos.bloquear !== false);
      if (!bloqueado[0]?.activo) return null;
      if (!(await tx.servicioReserva.findFirst({ where: { id: datos.servicio.id, activo: true }, select: { id: true } }))) return null;
      if (await hayEmpalme(tx, doctorId, datos.inicio, fin)) return null;
      return tx.cita.create({
        data: {
          contactoId: datos.contactoId,
          conversacionId: datos.conversacionId ?? null,
          doctorId,
          servicioId: datos.servicio.id,
          titulo: datos.servicio.nombre,
          notas: datos.notas,
          inicio: datos.inicio,
          fin,
          origen: datos.origen ?? "en_linea",
          tokenGestion: crypto.randomBytes(16).toString("hex"),
        },
        include: { doctor: { select: { nombre: true } } },
      });
    });
    if (cita) return cita;
  }
  return null;
}

/**
 * Mueve una cita a otro inicio conservando su duración, con el mismo bloqueo del especialista
 * y revisión de empalmes que reservarCita (la propia cita no cuenta). null = horario ocupado.
 */
export async function reprogramarCita(
  orgId: bigint,
  cita: { id: bigint; doctorId: bigint; inicio: Date; fin: Date },
  nuevoInicio: Date,
  bloquear = true,
) {
  const fin = new Date(nuevoInicio.getTime() + (cita.fin.getTime() - cita.inicio.getTime()));
  return transaccionTenant(orgId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM citas WHERE id = ${cita.id} FOR UPDATE`;
    const actual = await tx.cita.findFirst({ where: { id: cita.id } });
    if (!actual || !["programada", "confirmada"].includes(actual.estado) || actual.doctorId !== cita.doctorId || +actual.inicio !== +cita.inicio || +actual.fin !== +cita.fin) return null;
    const bloqueado = await bloquearAgenda(tx, [cita.doctorId], bloquear);
    if (!bloqueado[0]?.activo) return null;
    if (await hayEmpalme(tx, cita.doctorId, nuevoInicio, fin, cita.id)) return null;
    // recordatorioEnviadoAt = null: el aviso de la hora nueva debe volver a salir.
    return tx.cita.update({
      where: { id: cita.id },
      data: { inicio: nuevoInicio, fin, recordatorioEnviadoAt: null, recordatorioIntentos: 0, recordatorioIntentadoAt: null },
      include: { doctor: { select: { nombre: true } } },
    });
  });
}

/** Empresa dueña de una cita por el token de su enlace público, o null. */
export async function orgDeToken(token: string) {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const [fila] = await dbRaw.$queryRaw<{ org_id: bigint | null }[]>`SELECT resolve_org_by_cita_token(${token}) AS org_id`;
  return fila?.org_id ?? null;
}
