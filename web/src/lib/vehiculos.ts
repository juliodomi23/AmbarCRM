import { dinero } from "./dinero.ts";
import type { EstadoVehiculo, Prisma } from "@prisma/client";

export const ESTADOS_VEHICULO = [
  "disponible",
  "reservado",
  "vendido",
  "taller",
] as const satisfies readonly EstadoVehiculo[];

export const ETIQUETAS_ESTADO_VEHICULO: Record<EstadoVehiculo, string> = {
  disponible: "Disponible",
  reservado: "Reservado",
  vendido: "Vendido",
  taller: "En taller",
};

function texto(valor: unknown) {
  return String(valor ?? "").trim() || null;
}

function numeroEntero(valor: unknown, minimo = 0) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= minimo ? numero : null;
}

export function validarVehiculo(body: Record<string, unknown>) {
  const marca = texto(body.marca);
  const modelo = texto(body.modelo);
  const anio = numeroEntero(body.anio, 1900);
  const kilometraje = numeroEntero(body.kilometraje);
  const precio = dinero(body.precio);
  const estado = String(body.estado ?? "disponible") as EstadoVehiculo;

  if (!marca || !modelo) return { error: "Marca y modelo son obligatorios" } as const;
  if (!anio || anio > new Date().getFullYear() + 1) {
    return { error: "El año del vehículo no es válido" } as const;
  }
  if (kilometraje === null) return { error: "El kilometraje no es válido" } as const;
  if (precio === null) {
    return { error: "El precio no es válido" } as const;
  }
  if (!ESTADOS_VEHICULO.includes(estado)) {
    return { error: "El estado del vehículo no es válido" } as const;
  }

  const data: Prisma.VehiculoUncheckedCreateInput = {
    marca,
    modelo,
    anio,
    kilometraje,
    precio,
    estado,
    numeroStock: texto(body.numeroStock),
    vin: texto(body.vin)?.toUpperCase() ?? null,
    version: texto(body.version),
    color: texto(body.color),
    fotoUrl: texto(body.fotoUrl),
    notas: texto(body.notas),
  };
  return { data } as const;
}

