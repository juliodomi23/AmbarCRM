import { Prisma } from "@prisma/client";
import type { ClaveModulo } from "@/lib/modulos";
import { requireModuloActivo } from "@/lib/modulos";
import { requireSesion } from "@/lib/session";

export type SesionModulo = {
  userId: bigint | null;
  orgId: bigint | null;
  rol: "admin" | "agente" | undefined;
  puesto: string;
};

type OpcionesModulo = { admin?: boolean };
type RespuestaHandler = Response | Promise<Response>;

export function conModulo<Argumentos extends unknown[]>(
  clave: ClaveModulo,
  opciones: OpcionesModulo,
  handler: (sesion: SesionModulo, ...argumentos: Argumentos) => RespuestaHandler,
) {
  return async (...argumentos: Argumentos) => {
    const sesion = await requireSesion(Boolean(opciones.admin));
    if ("error" in sesion) return sesion.error;
    const bloqueado = await requireModuloActivo(clave, sesion);
    if (bloqueado) return bloqueado;
    try {
      return await handler(sesion, ...argumentos);
    } catch (error) {
      return respuestaDeError(error);
    }
  };
}

/** Errores de datos del cliente que no deben verse como 500 (id mal formado, registro inexistente). */
function respuestaDeError(error: unknown): Response {
  if (error instanceof SyntaxError || error instanceof RangeError) {
    return Response.json({ error: "datos inválidos" }, { status: 400 });
  }
  if (error instanceof Prisma.PrismaClientValidationError) {
    return Response.json({ error: "datos inválidos" }, { status: 400 });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    return Response.json({ error: "registro inexistente" }, { status: 404 });
  }
  throw error;
}
