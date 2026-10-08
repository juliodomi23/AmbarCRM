import { dinero } from "./dinero.ts";
const ESTADOS_EXPEDIENTE = ["activo", "suspendido", "cerrado", "archivado"] as const;
const TIPOS_REGISTRO = ["actuacion", "audiencia", "documento", "termino", "parte", "seguimiento"] as const;

export function esPasante(puesto?: string, rol?: string) {
  return rol !== "admin" && puesto?.trim().toLocaleLowerCase("es-MX") === "pasante";
}

function texto(valor: unknown, maximo = 500) {
  const limpio = String(valor ?? "").trim();
  return limpio ? limpio.slice(0, maximo) : null;
}

function entero(valor: unknown) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? BigInt(numero) : null;
}

function fecha(valor: unknown) {
  if (!valor) return null;
  const resultado = new Date(String(valor));
  return Number.isNaN(resultado.getTime()) ? null : resultado;
}

export function validarExpedienteLegal(body: Record<string, unknown>) {
  const numeroInterno = texto(body.numeroInterno, 120);
  const materia = texto(body.materia, 120);
  if (!numeroInterno && !materia) {
    return { error: "Captura al menos el número interno o la materia" } as const;
  }
  const estado = String(body.estado ?? "activo");
  if (!ESTADOS_EXPEDIENTE.includes(estado as (typeof ESTADOS_EXPEDIENTE)[number])) {
    return { error: "Estado de expediente inválido" } as const;
  }
  const cuantia = body.cuantia === "" || body.cuantia == null ? null : dinero(body.cuantia);
  if (cuantia === null && body.cuantia !== "" && body.cuantia != null) {
    return { error: "La cuantía debe ser un monto positivo con máximo 2 decimales" } as const;
  }
  return {
    data: {
      numeroInterno,
      numeroJudicial: texto(body.numeroJudicial, 120),
      contactoId: entero(body.contactoId),
      responsableId: entero(body.responsableId),
      sucursalId: entero(body.sucursalId),
      rolCliente: texto(body.rolCliente, 120),
      materia,
      tipoJuicio: texto(body.tipoJuicio, 160),
      juzgado: texto(body.juzgado, 200),
      etapaProcesal: texto(body.etapaProcesal, 160),
      estado,
      cuantia,
      resumen: texto(body.resumen, 5000),
      fechaInicio: fecha(body.fechaInicio),
    },
  } as const;
}

export function validarRegistroLegal(body: Record<string, unknown>) {
  const tipo = String(body.tipo ?? "seguimiento");
  const titulo = texto(body.titulo, 250);
  if (!TIPOS_REGISTRO.includes(tipo as (typeof TIPOS_REGISTRO)[number])) {
    return { error: "Tipo de registro inválido" } as const;
  }
  if (!titulo) return { error: "El título es obligatorio" } as const;
  return {
    data: {
      tipo,
      titulo,
      descripcion: texto(body.descripcion, 5000),
      estado: texto(body.estado, 80),
      fechaInicio: fecha(body.fechaInicio),
      fechaFin: fecha(body.fechaFin),
      archivoUrl: texto(body.archivoUrl, 2000),
    },
  } as const;
}

export function validarMovimientoLegal(body: Record<string, unknown>) {
  const concepto = texto(body.concepto, 250);
  const tipo = texto(body.tipo, 80);
  const monto = dinero(body.monto, { permitirNegativo: true });
  if (!concepto || !tipo) return { error: "Tipo y concepto son obligatorios" } as const;
  if (monto === null) return { error: "Monto inválido (máximo 2 decimales)" } as const;
  return {
    data: {
      tipo,
      concepto,
      monto,
      estado: texto(body.estado, 80),
      fecha: fecha(body.fecha),
      expedienteId: entero(body.expedienteId),
      contactoId: entero(body.contactoId),
      sucursalId: entero(body.sucursalId),
    },
  } as const;
}

export function validarAsesoriaLegal(body: Record<string, unknown>) {
  const tema = texto(body.tema, 250);
  if (!tema) return { error: "El tema es obligatorio" } as const;
  return {
    data: {
      tema,
      resumen: texto(body.resumen, 5000),
      estado: texto(body.estado, 80) ?? "pendiente",
      seguimiento: texto(body.seguimiento, 2000),
      origen: texto(body.origen, 120),
      fecha: fecha(body.fecha),
      contactoId: entero(body.contactoId),
      expedienteId: entero(body.expedienteId),
      sucursalId: entero(body.sucursalId),
      abogadoId: entero(body.abogadoId),
    },
  } as const;
}

const TIPOS_OPERACION = ["checada", "actividad", "incidencia"] as const;

export function validarSucursalLegal(body: Record<string, unknown>) {
  const nombre = texto(body.nombre, 160);
  if (!nombre) return { error: "El nombre de la sucursal es obligatorio" } as const;
  return {
    data: { nombre, direccion: texto(body.direccion, 300), telefono: texto(body.telefono, 30) },
  } as const;
}

export function validarRegistroOperacion(body: Record<string, unknown>) {
  const tipo = String(body.tipo ?? "checada");
  if (!TIPOS_OPERACION.includes(tipo as (typeof TIPOS_OPERACION)[number])) {
    return { error: "Tipo de registro inválido" } as const;
  }
  return {
    data: {
      tipo,
      fecha: fecha(body.fecha) ?? new Date(),
      estado: texto(body.estado, 80),
      descripcion: texto(body.descripcion, 2000),
      sucursalId: entero(body.sucursalId),
    },
  } as const;
}
