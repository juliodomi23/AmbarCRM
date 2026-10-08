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
    return handler(sesion, ...argumentos);
  };
}
