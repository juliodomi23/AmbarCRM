// Datos de los módulos por giro (citas, productos, cotizaciones…). Los de la fase 3 se agregan aquí.
import type { Datos, GiroId, UsuarioD } from "./tipos";

export type AyudasSemilla = { id: () => string; atiende: (i?: number) => UsuarioD };

export function sembrarExtra(datos: Datos, giro: GiroId, ayudas: AyudasSemilla) {
  if (giro === "clinica") {
    const definiciones: Array<[string, string, string, string[]]> = [
      ["tipo_tratamiento", "Tipo de tratamiento", "opcion", ["Consulta", "Limpieza", "Ortodoncia"]],
      ["alergias", "Alergias", "texto", []],
      ["primera_visita", "Primera visita", "si_no", []],
    ];
    definiciones.forEach(([clave, etiqueta, tipo, opciones], orden) =>
      datos.camposPersonalizados.push({ id: ayudas.id(), entidad: "contacto", clave, etiqueta, tipo, opciones, activo: true, orden }),
    );
  }
}
