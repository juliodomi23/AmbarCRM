// Reglas puras del módulo Despacho: sin base de datos para poder importarse desde el cliente.
const ZONA = "America/Mexico_City";

export const PERIODICIDADES = ["semanal", "mensual", "bimestral", "trimestral", "anual"] as const;
export type Periodicidad = (typeof PERIODICIDADES)[number];

export const ESTADOS_DESPACHO = ["pendiente", "en_proceso", "completada", "bloqueada"] as const;
export type EstadoDespacho = (typeof ESTADOS_DESPACHO)[number];

export const TIPOS_ACTIVIDAD = ["fija", "extraordinaria"] as const;
export type TipoActividad = (typeof TIPOS_ACTIVIDAD)[number];

type Partes = { y: number; m: number; d: number };

function partesTexto(fecha: string): Partes {
  const partes = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(fecha.trim());
  if (!partes) return { y: 1970, m: 1, d: 1 };
  return { y: Number(partes[1]), m: Number(partes[2]), d: Number(partes[3] ?? 1) };
}

function partesMexico(fecha: Date): Partes {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(fecha).map((parte) => [parte.type, parte.value]),
  );
  return { y: Number(partes.year), m: Number(partes.month), d: Number(partes.day) };
}

function partes(fecha: string | Date): Partes {
  return typeof fecha === "string" ? partesTexto(fecha) : partesMexico(fecha);
}

function iso(anio: number, mes: number, dia: number) {
  return new Date(Date.UTC(anio, mes - 1, dia)).toISOString().slice(0, 10);
}

function sumarDias(fecha: string, dias: number) {
  const base = new Date(`${fecha}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

function ultimoDia(anio: number, mes: number) {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

/** Clave civil de una fecha DATE de la base (llega como medianoche UTC). */
export function claveFecha(fecha: string | Date) {
  if (typeof fecha === "string") {
    const { y, m, d } = partesTexto(fecha);
    return iso(y, m, d);
  }
  return fecha.toISOString().slice(0, 10);
}

export function periodoDe(fecha: string | Date, periodicidad: Periodicidad) {
  const { y, m, d } = partes(fecha);
  if (periodicidad === "semanal") {
    const diaSemana = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return sumarDias(iso(y, m, d), -((diaSemana + 6) % 7));
  }
  if (periodicidad === "mensual") return iso(y, m, 1);
  if (periodicidad === "bimestral") return iso(y, m % 2 === 1 ? m : m - 1, 1);
  if (periodicidad === "trimestral") return iso(y, Math.floor((m - 1) / 3) * 3 + 1, 1);
  return iso(y, 1, 1);
}

/** Periodos que se generan al pedir un mes: los semanales producen una instancia por semana. */
export function periodosDelMes(mes: string, periodicidad: Periodicidad) {
  const { y, m } = partesTexto(mes);
  if (periodicidad !== "semanal") return [periodoDe(mes, periodicidad)];
  const primero = iso(y, m, 1);
  const diaSemana = new Date(`${primero}T00:00:00.000Z`).getUTCDay();
  let lunes = sumarDias(primero, (8 - diaSemana) % 7);
  const periodos: string[] = [];
  while (partesTexto(lunes).m === m) {
    periodos.push(lunes);
    lunes = sumarDias(lunes, 7);
  }
  return periodos;
}

/** Día límite dentro del periodo; en semanal el límite es el día de la semana (1 = lunes). */
export function fechaLimiteDe(periodo: string, diaLimite: number, periodicidad: Periodicidad = "mensual") {
  const { y, m } = partesTexto(periodo);
  if (periodicidad === "semanal") {
    const dia = Math.min(Math.max(Math.trunc(diaLimite), 1), 7);
    return sumarDias(periodoDe(periodo, "semanal"), dia - 1);
  }
  const dia = Math.min(Math.max(Math.trunc(diaLimite), 1), ultimoDia(y, m));
  return iso(y, m, dia);
}

export type ActividadPuntuable = {
  estado: string;
  requiereConfirmacion?: boolean;
  confirmadaAt?: string | Date | null;
  peso?: number | null;
};

function pesoDe(actividad: { peso?: number | null }) {
  return actividad.peso && actividad.peso > 0 ? actividad.peso : 1;
}

/** Solo las completadas y confirmadas cuentan para el avance. */
export function actividadCuentaComoCompletada(actividad: ActividadPuntuable) {
  return actividad.estado === "completada" &&
    (actividad.requiereConfirmacion === false || Boolean(actividad.confirmadaAt));
}

/** Porcentaje entero de avance ponderado por peso; no todas las actividades valen lo mismo. */
export function porcentajeAvance(actividades: ActividadPuntuable[]) {
  if (actividades.length === 0) return null;
  const pesoTotal = actividades.reduce((suma, actividad) => suma + pesoDe(actividad), 0);
  if (pesoTotal === 0) return null;
  const pesoCompletado = actividades.filter(actividadCuentaComoCompletada).reduce((suma, actividad) => suma + pesoDe(actividad), 0);
  return Math.round((pesoCompletado / pesoTotal) * 100);
}

export function estaAtrasada(
  actividad: { estado: string; fechaLimite: string | Date },
  ahora: Date = new Date(),
) {
  if (actividad.estado === "completada") return false;
  const limite = Date.parse(`${claveFecha(actividad.fechaLimite)}T23:59:59.999-06:00`);
  return ahora.getTime() > limite;
}

export type AvanceGrupo = {
  clave: string;
  total: number;
  completadas: number;
  atrasadas: number;
  porcentaje: number | null;
};

export function agruparAvance<T extends { estado?: string; fechaLimite?: string | Date; confirmadaAt?: string | Date | null; peso?: number | null }>(actividades: T[], clave: (actividad: T) => string): AvanceGrupo[] {
  const grupos = new Map<string, { total: number; completadas: number; atrasadas: number }>();
  for (const actividad of actividades) {
    const nombre = clave(actividad);
    const grupo = grupos.get(nombre) ?? { total: 0, completadas: 0, atrasadas: 0 };
    grupo.total += 1;
    if (actividadCuentaComoCompletada(actividad as ActividadPuntuable)) grupo.completadas += 1;
    else if (actividad.fechaLimite && estaAtrasada({ estado: actividad.estado ?? "", fechaLimite: actividad.fechaLimite })) grupo.atrasadas += 1;
    grupos.set(nombre, grupo);
  }
  return [...grupos.entries()]
    .map(([nombre, grupo]) => ({
      clave: nombre,
      total: grupo.total,
      completadas: grupo.completadas,
      atrasadas: grupo.atrasadas,
      porcentaje: porcentajeAvance(
        actividades.filter((actividad) => clave(actividad) === nombre) as ActividadPuntuable[],
      ),
    }))
    .sort((a, b) => a.clave.localeCompare(b.clave, "es-MX"));
}

export function tonoAvance(porcentaje: number | null, atrasadas = 0) {
  if (atrasadas > 0 || (porcentaje !== null && porcentaje < 40)) return "destructive" as const;
  if (porcentaje !== null && porcentaje < 80) return "warning" as const;
  if (porcentaje !== null) return "success" as const;
  return "neutral" as const;
}

export function etiquetaAvance(porcentaje: number | null, atrasadas = 0) {
  if (atrasadas > 0) return `En riesgo · ${atrasadas} atrasada${atrasadas === 1 ? "" : "s"}`;
  if (porcentaje === null) return "Sin actividades";
  if (porcentaje < 40) return "Requiere atención";
  if (porcentaje < 80) return "En curso";
  return "Al día";
}

/** Flujo lineal: pendiente -> en_proceso -> (completada | bloqueada); bloqueada solo vuelve a en_proceso. */
const SIGUIENTES_DESPACHO: Record<EstadoDespacho, EstadoDespacho[]> = {
  pendiente: ["en_proceso"],
  en_proceso: ["completada", "bloqueada"],
  bloqueada: ["en_proceso"],
  completada: [],
};

export function transicionDespachoValida(actual: string, siguiente: string) {
  if (actual === siguiente) return true;
  if (!ESTADOS_DESPACHO.includes(actual as EstadoDespacho)) return false;
  return SIGUIENTES_DESPACHO[actual as EstadoDespacho].includes(siguiente as EstadoDespacho);
}

export function puedeGestionarDespacho(puesto: string | undefined, rol: string | undefined) {
  if (rol === "admin") return true;
  return ["Administrador", "Director general", "Gerente general"].includes(String(puesto ?? "").trim());
}

export function idsPermisoDespacho(config: unknown, clave: "usuariosAccesoTotal" | "usuariosConfirmadores") {
  if (!config || typeof config !== "object" || Array.isArray(config)) return [];
  const valor = (config as Record<string, unknown>)[clave];
  return Array.isArray(valor) ? valor.map(String) : [];
}

export function puedeVerTodasActividadesDespacho(
  usuario: { id?: string | bigint | null; puesto?: string; rol?: string },
  config?: unknown,
) {
  if (puedeGestionarDespacho(usuario.puesto, usuario.rol)) return true;
  return usuario.id != null && idsPermisoDespacho(config, "usuariosAccesoTotal").includes(String(usuario.id));
}

export function puedeConfirmarActividadDespacho(
  usuario: { id?: string | bigint | null; puesto?: string; rol?: string },
  config?: unknown,
) {
  if (puedeGestionarDespacho(usuario.puesto, usuario.rol)) return true;
  return usuario.id != null && idsPermisoDespacho(config, "usuariosConfirmadores").includes(String(usuario.id));
}

export function puedeTocarActividad(
  actividad: { responsableId: string | bigint | null },
  userId: string | bigint | null,
  puesto: string | undefined,
  rol: string | undefined,
) {
  if (puedeGestionarDespacho(puesto, rol)) return true;
  return userId != null && actividad.responsableId != null && String(actividad.responsableId) === String(userId);
}

export function etiquetaPeriodicidad(periodicidad: string) {
  return ({ semanal: "Semanal", mensual: "Mensual", bimestral: "Bimestral", trimestral: "Trimestral", anual: "Anual" } as Record<string, string>)[periodicidad] ?? periodicidad;
}
