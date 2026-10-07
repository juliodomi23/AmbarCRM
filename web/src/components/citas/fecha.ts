export const ZONA_CITAS = "America/Mexico_City";
export const HORA_INICIO = 8;
export const HORA_FIN = 20;
export const ALTURA_HORA = 64;

type PartesFecha = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

export function partesEnZona(fecha: Date): PartesFecha {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_CITAS,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(fecha);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    Number(partes.find((parte) => parte.type === tipo)?.value ?? 0);
  return {
    year: valor("year"),
    month: valor("month"),
    day: valor("day"),
    hour: valor("hour"),
    minute: valor("minute"),
  };
}

function claveDesdePartes(partes: PartesFecha) {
  return [partes.year, partes.month, partes.day]
    .map((valor, indice) =>
      indice === 0 ? String(valor) : String(valor).padStart(2, "0"),
    )
    .join("-");
}

export function claveFecha(fecha: Date) {
  return claveDesdePartes(partesEnZona(fecha));
}

export function sumarDias(clave: string, cantidad: number) {
  const fecha = new Date(`${clave}T00:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + cantidad);
  return fecha.toISOString().slice(0, 10);
}

export function inicioDeSemana(clave: string) {
  const fecha = new Date(`${clave}T00:00:00Z`);
  const diasDesdeLunes = (fecha.getUTCDay() + 6) % 7;
  return sumarDias(clave, -diasDesdeLunes);
}

export function fechaMexicoAUTC(clave: string, hora: string) {
  const [year, month, day] = clave.split("-").map(Number);
  const [hours, minutes] = hora.split(":").map(Number);
  const objetivo = Date.UTC(year, month - 1, day, hours, minutes);
  let resultado = new Date(objetivo);

  for (let intento = 0; intento < 2; intento += 1) {
    const partes = partesEnZona(resultado);
    const representacionUTC = Date.UTC(
      partes.year,
      partes.month - 1,
      partes.day,
      partes.hour,
      partes.minute,
    );
    resultado = new Date(objetivo - (representacionUTC - resultado.getTime()));
  }

  return resultado;
}

export function valorFechaLocal(fecha: Date) {
  const partes = partesEnZona(fecha);
  const hora = `${String(partes.hour).padStart(2, "0")}:${String(
    partes.minute,
  ).padStart(2, "0")}`;
  return `${claveDesdePartes(partes)}T${hora}`;
}

export function valorInicial(duracionMinutos = 0) {
  const bloque = 30 * 60_000;
  const siguienteBloque = Math.ceil(Date.now() / bloque) * bloque;
  return valorFechaLocal(new Date(siguienteBloque + duracionMinutos * 60_000));
}

export function convertirFormularioAISO(valor: string) {
  const [fecha, hora] = valor.split("T");
  return fechaMexicoAUTC(fecha, hora).toISOString();
}
