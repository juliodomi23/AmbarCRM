export const ZONA_CITAS = "America/Mexico_City";
export type VariableRecordatorio =
  | "nombre_contacto"
  | "fecha_hora"
  | "titulo_cita"
  | "nombre_negocio";
export function fechaHoraCita(date: Date) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: ZONA_CITAS,
  }).format(date);
}
export function recordatorioDebeEnviarse(
  inicio: Date,
  anticipacionHoras: number,
  ahora = new Date(),
) {
  return (
    inicio.getTime() - ahora.getTime() <= anticipacionHoras * 3_600_000 &&
    inicio > ahora
  );
}

export function valoresRecordatorio(
  mapeo: VariableRecordatorio[],
  datos: {
    nombreContacto: string;
    inicio: Date;
    titulo: string;
    nombreNegocio: string;
  },
) {
  const valores: Record<VariableRecordatorio, string> = {
    nombre_contacto: datos.nombreContacto,
    fecha_hora: fechaHoraCita(datos.inicio),
    titulo_cita: datos.titulo,
    nombre_negocio: datos.nombreNegocio,
  };
  return mapeo.map((variable) => valores[variable]);
}
