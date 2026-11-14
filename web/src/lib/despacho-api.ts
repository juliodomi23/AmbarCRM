import { NextResponse } from "next/server";
import type { SesionModulo } from "@/lib/con-modulo";
import { puedeGestionarDespacho } from "@/lib/despacho";

export const texto = (valor: unknown) => String(valor ?? "").trim();

export function exigirGestion(sesion: SesionModulo) {
  if (!puedeGestionarDespacho(sesion.puesto, sesion.rol)) {
    return NextResponse.json({ error: "Solo dirección o administración puede hacer este cambio" }, { status: 403 });
  }
  return null;
}

/** Fecha DATE (YYYY-MM-DD) sin hora, validada contra el calendario real. */
export function fechaCivil(valor: unknown): string | null {
  const textoValor = texto(valor);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(textoValor)) return null;
  const fecha = new Date(`${textoValor}T00:00:00.000Z`);
  return Number.isFinite(fecha.getTime()) && fecha.toISOString().slice(0, 10) === textoValor ? textoValor : null;
}

export function aFecha(valor: string) {
  return new Date(`${valor}T00:00:00.000Z`);
}

export function mesValido(valor: unknown): string | null {
  const textoValor = texto(valor);
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(textoValor) ? textoValor : null;
}

const CLAVES_APELACION = [
  "apelacionComentario",
  "apelacionEstado",
  "apelacionRespuesta",
  "apelacionCreadaAt",
  "apelacionResueltaAt",
  "apelacionResueltaPorId",
] as const;

/** Quita de la respuesta los datos de apelación que el usuario no debe ver. */
export function sinDatosApelacion<T extends object>(actividad: T): T {
  const copia = { ...actividad } as Record<string, unknown>;
  for (const clave of CLAVES_APELACION) delete copia[clave];
  return copia as T;
}
