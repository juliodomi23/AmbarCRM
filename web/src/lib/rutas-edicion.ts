import { NextResponse } from "next/server";
import { ErrorCupo } from "@/lib/cupos-db";
import { aBigInt } from "@/lib/ids";

export type PropsId = { params: Promise<{ id: string }> };

/** Id numérico de la URL, o null. */
export async function idDeRuta(props: PropsId) {
  return aBigInt((await props.params).id);
}

export const noEncontrado = () => NextResponse.json({ error: "registro inexistente" }, { status: 404 });

/** Errores de negocio (cupo, saldo, registro con historial) como respuesta para el usuario. */
export function respuestaNegocio(error: unknown) {
  if (error instanceof ErrorCupo) return NextResponse.json({ error: error.message }, { status: error.status });
  throw error;
}

/** Lo guardado + lo que llega del formulario, para revalidar con el mismo validador del alta. */
export function fusionar<T extends object>(actual: T, cambios: Record<string, unknown>): Record<string, unknown> {
  const base = Object.fromEntries(
    Object.entries(actual).map(([clave, valor]) => [clave, valor instanceof Date ? valor.toISOString() : valor]),
  );
  return { ...base, ...cambios };
}
