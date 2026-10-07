import type { Prisma } from "@prisma/client";

export const ESTADOS_PROPIEDAD = [
  "disponible",
  "reservada",
  "vendida",
  "rentada",
] as const;

export const ETIQUETAS_ESTADO_PROPIEDAD: Record<string, string> = {
  disponible: "Disponible",
  reservada: "Reservada",
  vendida: "Vendida",
  rentada: "Rentada",
};

function texto(valor: unknown) {
  return String(valor ?? "").trim() || null;
}

function numero(valor: unknown, minimo = 0) {
  const resultado = Number(valor);
  return Number.isFinite(resultado) && resultado >= minimo ? resultado : null;
}

export function validarPropiedad(body: Record<string, unknown>) {
  const titulo = texto(body.titulo);
  const tipo = texto(body.tipo);
  const operacion = texto(body.operacion);
  const ciudad = texto(body.ciudad);
  const recamaras = numero(body.recamaras);
  const banos = numero(body.banos);
  const superficie = numero(body.superficie);
  const precio = numero(body.precio);
  const estado = String(body.estado ?? "disponible");

  if (!titulo || !tipo || !operacion || !ciudad) {
    return { error: "Título, tipo, operación y ciudad son obligatorios" } as const;
  }
  if ([recamaras, banos, superficie, precio].some((valor) => valor === null)) {
    return { error: "Los datos numéricos no son válidos" } as const;
  }
  if (!ESTADOS_PROPIEDAD.includes(estado as (typeof ESTADOS_PROPIEDAD)[number])) {
    return { error: "El estado de la propiedad no es válido" } as const;
  }

  const data: Prisma.PropiedadUncheckedCreateInput = {
    titulo,
    tipo,
    operacion,
    ciudad,
    recamaras: Math.trunc(recamaras!),
    banos: banos!,
    superficie: superficie!,
    precio: precio!,
    estado,
    clave: texto(body.clave),
    direccion: texto(body.direccion),
    colonia: texto(body.colonia),
    fotoUrl: texto(body.fotoUrl),
    notas: texto(body.notas),
  };
  return { data } as const;
}

