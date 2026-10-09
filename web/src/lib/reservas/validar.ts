import { dinero } from "../dinero.ts";
import { fechaValida, minutosDeHora } from "./horarios.ts";

/** Validadores de la configuración de Reservas en línea (sin base de datos). */

const texto = (valor: unknown, maximo: number) => String(valor ?? "").trim().slice(0, maximo) || null;
const id = (valor: unknown) => (/^\d+$/.test(String(valor ?? "")) ? BigInt(String(valor)) : null);
const entero = (valor: unknown, min: number, max: number) => {
  const n = Number(valor);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

export function validarServicioReserva(body: Record<string, unknown>) {
  const nombre = texto(body.nombre, 120);
  const duracionMin = entero(body.duracionMin, 5, 720);
  const bufferMin = body.bufferMin === "" || body.bufferMin == null ? 0 : entero(body.bufferMin, 0, 240);
  const precio = body.precio === "" || body.precio == null ? 0 : dinero(body.precio);
  const doctorIds = String(body.doctorIds ?? "").split(",").filter(Boolean).map(id);
  if (!nombre) return { error: "El nombre es obligatorio" } as const;
  if (duracionMin === null) return { error: "La duración debe ser de 5 a 720 minutos" } as const;
  if (bufferMin === null) return { error: "El tiempo entre citas debe ser de 0 a 240 minutos" } as const;
  if (precio === null) return { error: "Precio inválido (máximo 2 decimales)" } as const;
  if (doctorIds.length === 0 || doctorIds.some((d) => d === null)) {
    return { error: "Elige al menos un especialista que dé el servicio" } as const;
  }
  return {
    data: {
      nombre, descripcion: texto(body.descripcion, 500), duracionMin, bufferMin, precio,
      activo: body.activo === undefined ? true : body.activo === true || body.activo === "true",
    },
    doctorIds: [...new Set(doctorIds as bigint[])],
  } as const;
}

export function validarHorarioDoctor(body: Record<string, unknown>) {
  const doctorId = id(body.doctorId);
  const diaSemana = entero(body.diaSemana, 0, 6);
  const inicioMin = minutosDeHora(body.inicio);
  const finMin = minutosDeHora(body.fin);
  if (!doctorId) return { error: "Elige al especialista" } as const;
  if (diaSemana === null) return { error: "Día de la semana inválido" } as const;
  if (inicioMin === null || finMin === null || inicioMin >= finMin) {
    return { error: "La hora de inicio debe ser antes que la de fin" } as const;
  }
  return { data: { doctorId, diaSemana, inicioMin, finMin } } as const;
}

/** Excepción de un día: sin horas = cerrado todo el día; con horas = horario especial. */
export function validarExcepcion(body: Record<string, unknown>) {
  const doctorId = id(body.doctorId);
  if (!doctorId) return { error: "Elige al especialista" } as const;
  if (!fechaValida(body.fecha)) return { error: "Fecha inválida" } as const;
  const conHoras = Boolean(body.inicio || body.fin);
  const inicioMin = conHoras ? minutosDeHora(body.inicio) : null;
  const finMin = conHoras ? minutosDeHora(body.fin) : null;
  if (conHoras && (inicioMin === null || finMin === null || inicioMin >= finMin)) {
    return { error: "Para un horario especial, la hora de inicio debe ser antes que la de fin" } as const;
  }
  return {
    data: { doctorId, fecha: new Date(`${body.fecha}T00:00:00Z`), inicioMin, finMin, motivo: texto(body.motivo, 200) },
  } as const;
}

export function validarAjustesReservas(body: Record<string, unknown>) {
  const anticipacionMin = entero(body.anticipacionMin, 0, 10_080);
  const ventanaDias = entero(body.ventanaDias, 1, 90);
  const granularidadMin = entero(body.granularidadMin, 5, 120);
  const maxPorTelefono = entero(body.maxPorTelefono, 1, 20);
  if (anticipacionMin === null) return { error: "La anticipación debe ser de 0 a 10,080 minutos" } as const;
  if (ventanaDias === null) return { error: "Se puede agendar de 1 a 90 días a futuro" } as const;
  if (granularidadMin === null) return { error: "Los horarios deben ir cada 5 a 120 minutos" } as const;
  if (maxPorTelefono === null) return { error: "Máximo de citas por teléfono: 1 a 20" } as const;
  return { data: { anticipacionMin, ventanaDias, granularidadMin, maxPorTelefono } } as const;
}
