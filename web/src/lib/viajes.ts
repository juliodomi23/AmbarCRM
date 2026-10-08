function texto(valor: unknown, maximo = 500) {
  const limpio = String(valor ?? "").trim();
  return limpio ? limpio.slice(0, maximo) : null;
}

function enteroPositivo(valor: unknown) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

function id(valor: unknown) {
  const numero = enteroPositivo(valor);
  return numero ? BigInt(numero) : null;
}

function fecha(valor: unknown) {
  if (!valor) return null;
  const resultado = new Date(String(valor));
  return Number.isNaN(resultado.getTime()) ? null : resultado;
}

export function validarTour(body: Record<string, unknown>) {
  const nombre = texto(body.nombre, 200);
  const destino = texto(body.destino, 200);
  const precio = Number(body.precio);
  const capacidad = enteroPositivo(body.capacidad);
  if (!nombre || !destino) return { error: "Nombre y destino son obligatorios" } as const;
  if (!Number.isFinite(precio) || precio < 0) return { error: "Precio inválido" } as const;
  if (!capacidad) return { error: "La capacidad debe ser mayor a cero" } as const;
  return {
    data: {
      clave: texto(body.clave, 80),
      nombre,
      destino,
      pais: texto(body.pais, 100),
      tipo: texto(body.tipo, 80) ?? "tour",
      duracionDias: enteroPositivo(body.duracionDias) ?? 1,
      fechaSalida: fecha(body.fechaSalida),
      fechaRegreso: fecha(body.fechaRegreso),
      capacidad,
      precio,
      moneda: texto(body.moneda, 8) ?? "MXN",
      puntoEncuentro: texto(body.puntoEncuentro, 300),
      incluye: texto(body.incluye, 3000),
      noIncluye: texto(body.noIncluye, 3000),
      estado: texto(body.estado, 40) ?? "publicado",
      imagenUrl: texto(body.imagenUrl, 2000),
    },
  } as const;
}

export function validarReservaTour(body: Record<string, unknown>) {
  const tourId = id(body.tourId);
  const contactoId = id(body.contactoId);
  const viajeros = enteroPositivo(body.viajeros);
  const total = Number(body.total);
  if (!tourId || !contactoId) return { error: "Tour y viajero son obligatorios" } as const;
  if (!viajeros) return { error: "Debe existir al menos un viajero" } as const;
  if (!Number.isFinite(total) || total < 0) return { error: "Total inválido" } as const;
  return {
    data: {
      codigo: texto(body.codigo, 80) ?? `RES-${Date.now()}`,
      tourId,
      contactoId,
      viajeros,
      estado: texto(body.estado, 40) ?? "solicitada",
      total,
      saldo: body.saldo == null ? total : Number(body.saldo),
      fechaSalida: fecha(body.fechaSalida),
      notas: texto(body.notas, 3000),
    },
  } as const;
}

export function validarPagoTour(body: Record<string, unknown>) {
  const reservaId = id(body.reservaId);
  const monto = Number(body.monto);
  if (!reservaId) return { error: "La reserva es obligatoria" } as const;
  if (!Number.isFinite(monto) || monto <= 0) return { error: "Monto inválido" } as const;
  return {
    data: {
      reservaId,
      concepto: texto(body.concepto, 200) ?? "Pago de reservación",
      monto,
      fecha: fecha(body.fecha) ?? new Date(),
      metodo: texto(body.metodo, 80),
      referencia: texto(body.referencia, 160),
      estado: texto(body.estado, 40) ?? "aplicado",
    },
  } as const;
}
