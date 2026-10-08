import { dinero } from "./dinero.ts";
function texto(valor: unknown, maximo = 500) {
  const limpio = String(valor ?? "").trim();
  return limpio ? limpio.slice(0, maximo) : null;
}

function id(valor: unknown) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? BigInt(numero) : null;
}

function fecha(valor: unknown) {
  const resultado = new Date(String(valor ?? ""));
  return Number.isNaN(resultado.getTime()) ? null : resultado;
}

export function validarAlumno(body: Record<string, unknown>) {
  const contactoId = id(body.contactoId);
  if (!contactoId) return { error: "El contacto es obligatorio" } as const;
  return {
    data: {
      contactoId,
      matricula: texto(body.matricula, 80),
      fechaNacimiento: fecha(body.fechaNacimiento),
      tutorNombre: texto(body.tutorNombre, 200),
      tutorTelefono: texto(body.tutorTelefono, 30),
      nivel: texto(body.nivel, 120),
      estado: texto(body.estado, 40) ?? "activo",
      observaciones: texto(body.observaciones, 3000),
    },
  } as const;
}

export function validarCurso(body: Record<string, unknown>) {
  const nombre = texto(body.nombre, 200);
  const capacidad = Number(body.capacidad);
  const mensualidad = dinero(body.mensualidad ?? 0);
  if (!nombre) return { error: "El nombre es obligatorio" } as const;
  if (!Number.isInteger(capacidad) || capacidad <= 0) return { error: "Capacidad inválida" } as const;
  if (mensualidad === null) return { error: "Mensualidad inválida (máximo 2 decimales)" } as const;
  return {
    data: {
      clave: texto(body.clave, 80),
      nombre,
      categoria: texto(body.categoria, 120),
      modalidad: texto(body.modalidad, 40) ?? "presencial",
      profesor: texto(body.profesor, 200),
      horario: texto(body.horario, 300),
      fechaInicio: fecha(body.fechaInicio),
      fechaFin: fecha(body.fechaFin),
      capacidad,
      mensualidad,
      estado: texto(body.estado, 40) ?? "abierto",
    },
  } as const;
}

export function validarInscripcion(body: Record<string, unknown>) {
  const alumnoId = id(body.alumnoId);
  const cursoId = id(body.cursoId);
  if (!alumnoId || !cursoId) return { error: "Alumno y curso son obligatorios" } as const;
  const descuento = Number(body.descuento ?? 0);
  if (!Number.isFinite(descuento) || descuento < 0 || descuento > 100) {
    return { error: "Descuento inválido" } as const;
  }
  return {
    data: {
      alumnoId,
      cursoId,
      fechaAlta: fecha(body.fechaAlta) ?? new Date(),
      estado: texto(body.estado, 40) ?? "activa",
      descuento,
      avance: Math.max(0, Math.min(100, Number(body.avance ?? 0))),
      notas: texto(body.notas, 2000),
    },
  } as const;
}

export function validarColegiatura(body: Record<string, unknown>) {
  const alumnoId = id(body.alumnoId);
  const monto = dinero(body.monto);
  const vencimiento = fecha(body.vencimiento);
  if (!alumnoId || !vencimiento) return { error: "Alumno y vencimiento son obligatorios" } as const;
  if (monto === null) return { error: "Monto inválido (máximo 2 decimales)" } as const;
  return {
    data: {
      alumnoId,
      inscripcionId: id(body.inscripcionId),
      concepto: texto(body.concepto, 200) ?? "Colegiatura",
      periodo: texto(body.periodo, 80),
      monto,
      vencimiento,
      estado: texto(body.estado, 40) ?? "pendiente",
      metodo: texto(body.metodo, 80),
    },
  } as const;
}

export function validarAsistencia(body: Record<string, unknown>) {
  const alumnoId = id(body.alumnoId);
  const cursoId = id(body.cursoId);
  const dia = fecha(body.fecha);
  if (!alumnoId || !cursoId || !dia) return { error: "Alumno, curso y fecha son obligatorios" } as const;
  return {
    data: {
      alumnoId,
      cursoId,
      fecha: dia,
      estado: texto(body.estado, 40) ?? "presente",
      notas: texto(body.notas, 1000),
    },
  } as const;
}
