import { diaSemana, fechaLocal, sumarDias } from "@/lib/reservas/horarios";

export type ConfigResenas = {
  enlaceGoogle: string | null;
  diasEntreSolicitudes: number;
  plantillaResena: { name: string; language: string } | null;
};

const HOSTS_GOOGLE = ["g.page", "google.com", "maps.app.goo.gl"];

/** Solo https y dominios de Google; evita que la configuración (o un query) sea un redirect abierto. */
export function enlaceGoogleValido(valor: unknown) {
  if (typeof valor !== "string") return null;
  let url: URL;
  try {
    url = new URL(valor.trim());
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const esGoogle = HOSTS_GOOGLE.some((permitido) => host === permitido || host.endsWith(`.${permitido}`));
  return url.protocol === "https:" && !url.username && !url.password && esGoogle ? url.toString() : null;
}

export function origenValido(valor: unknown) {
  const origen = typeof valor === "string" ? valor.trim().toLowerCase() : "";
  return /^[a-z0-9_-]{1,40}$/.test(origen) ? origen : "directo";
}

export function calificacionValida(valor: unknown) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= 1 && numero <= 5 ? numero : null;
}

export function configResenas(config: unknown): ConfigResenas {
  const valor = (config ?? {}) as Record<string, unknown>;
  const dias = Number(valor.diasEntreSolicitudes);
  const plantilla = valor.plantillaResena as Record<string, unknown> | null;
  return {
    enlaceGoogle: enlaceGoogleValido(valor.enlaceGoogle),
    diasEntreSolicitudes: Number.isInteger(dias) && dias >= 1 && dias <= 365 ? dias : 90,
    plantillaResena:
      plantilla && typeof plantilla.name === "string" && typeof plantilla.language === "string" && plantilla.name.trim()
        ? { name: plantilla.name.trim(), language: plantilla.language.trim() }
        : null,
  };
}

/** Lunes (AAAA-MM-DD) de la semana local en que cae el instante. */
export function semanaLocal(instante: Date, zona: string) {
  const fecha = fechaLocal(instante, zona);
  return sumarDias(fecha, -((diaSemana(fecha) + 6) % 7));
}

type Acumulado = Map<string, { total: number; suma: number }>;

export function resumenResenas(filas: readonly { calificacion: number; createdAt: Date; origen: string }[], zona: string) {
  const distribucion = [0, 0, 0, 0, 0];
  const semanas: Acumulado = new Map();
  const origenes: Acumulado = new Map();
  let suma = 0;
  for (const fila of filas) {
    distribucion[fila.calificacion - 1]++;
    suma += fila.calificacion;
    for (const [mapa, clave] of [[semanas, semanaLocal(fila.createdAt, zona)], [origenes, fila.origen]] as const) {
      const actual = mapa.get(clave) ?? { total: 0, suma: 0 };
      actual.total++;
      actual.suma += fila.calificacion;
      mapa.set(clave, actual);
    }
  }
  const filasDe = (mapa: Acumulado) =>
    [...mapa.entries()].map(([clave, { total, suma: acumulado }]) => ({ clave, total, promedio: acumulado / total }));
  return {
    total: filas.length,
    promedio: filas.length ? suma / filas.length : null,
    distribucion,
    tendencia: filasDe(semanas).sort((a, b) => a.clave.localeCompare(b.clave)),
    origenes: filasDe(origenes).sort((a, b) => b.total - a.total),
  };
}
