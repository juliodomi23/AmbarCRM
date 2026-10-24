export type TipoPushAtencion = "mensaje" | "atencion_humana";
export type EnviarPush = (titulo: string, cuerpo: string, url: string, usuarioId?: bigint, tipo?: TipoPushAtencion) => Promise<unknown>;

export function debeAvisarMensajeEntrante(botConfigurado: boolean, botActivo: boolean) {
  return !(botConfigurado && botActivo);
}

export async function avisarMensajeEntrante(
  push: EnviarPush,
  datos: { nombre: string; cuerpo: string; conversacionId: bigint; responsableId: bigint | null }
) {
  try {
    await push(datos.nombre, datos.cuerpo, `/chat?conv=${datos.conversacionId}`, datos.responsableId ?? undefined, "mensaje");
  } catch {
    // El aviso no debe interferir con la ingesta.
  }
}

export async function avisarHandoff(
  push: EnviarPush,
  resultado: { escalada: boolean; responsableId: bigint | null } | null,
  datos: { nombre: string; conversacionId: bigint }
) {
  if (!resultado?.escalada) return;
  try {
    await push(datos.nombre, "Requiere atención humana", `/chat?conv=${datos.conversacionId}`, resultado.responsableId ?? undefined, "atencion_humana");
  } catch {
    // El aviso no debe revertir ni fallar un handoff ya confirmado.
  }
}
