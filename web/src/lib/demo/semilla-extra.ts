// Datos de los módulos por giro (citas, productos, cotizaciones…). Se completan en la fase 3.
import type { Datos, GiroId, UsuarioD } from "./tipos";

export type AyudasSemilla = { id: () => string; atiende: (i?: number) => UsuarioD };

export function sembrarExtra(_datos: Datos, _giro: GiroId, _ayudas: AyudasSemilla) {
  // Fase 3.
}
