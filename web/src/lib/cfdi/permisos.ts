import { ErrorCfdi } from "./errores";

export type SesionFacturacion = {
  rol?: "admin" | "agente";
  puesto?: string | null;
};

export function puedeTimbrarCancelar(sesion: SesionFacturacion) {
  return sesion.rol === "admin" || sesion.puesto === "Administrador" || sesion.puesto === "Finanzas";
}

export function exigirTimbrarCancelar(sesion: SesionFacturacion) {
  if (!puedeTimbrarCancelar(sesion)) {
    throw new ErrorCfdi("Requiere Administrador o Finanzas para timbrar o cancelar", 403, "sin_permiso");
  }
}
