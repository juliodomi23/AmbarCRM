// Piezas puras (sin Prisma ni Node) del aviso de WhatsApp del taller: sirven en
// componentes cliente, en la API y en las pruebas.

export const ZONA_TALLER = "America/Mexico_City";

export const TIPOS_NOTIFICACION_TALLER = ["aprobacion", "listo", "estado"] as const;
export type TipoNotificacionTaller = (typeof TIPOS_NOTIFICACION_TALLER)[number];
export type FormaEnvioTaller = "oficial" | "simulado" | "manual";

export const LEYENDA_RECEPCION_POR_DEFECTO =
  "El taller no se hace responsable por objetos de valor dejados en el vehículo. El cliente autoriza la revisión y el diagnóstico del vehículo y confirma los datos de contacto. La vigencia de esta cotización es de 15 días naturales.";

/** Nombre del estado en lenguaje claro para el cliente. */
export const TEXTO_ESTADO_TALLER: Record<string, string> = {
  recibido: "Recibimos tu vehículo",
  diagnostico: "Estamos revisando tu vehículo",
  esperando_aprobacion: "Esperando tu aprobación",
  en_reparacion: "Tu vehículo está en reparación",
  listo: "Listo para entrega",
  entregado: "Vehículo entregado",
  cancelado: "Servicio cancelado",
};

export function textoEstadoTaller(estado: string) {
  return TEXTO_ESTADO_TALLER[estado] ?? estado.replaceAll("_", " ");
}

/** Las plantillas oficiales reciben las variables en este orden fijo. */
export const VARIABLES_PLANTILLA_TALLER: Record<TipoNotificacionTaller, string[]> = {
  aprobacion: ["nombre del cliente", "marca del vehículo", "modelo", "placa", "enlace de aprobación"],
  listo: ["nombre del cliente", "marca del vehículo", "modelo", "placa", "saldo por liquidar"],
  estado: ["nombre del cliente", "marca del vehículo", "modelo", "estado legible", "fecha promesa", "enlace de seguimiento"],
};

export const PLANTILLAS_SUGERIDAS: Record<TipoNotificacionTaller, string> = {
  aprobacion:
    "Hola {{1}}, tu {{2}} {{3}} ({{4}}) ya tiene diagnóstico. Revisa y aprueba la cotización aquí: {{5}}",
  listo:
    "Hola {{1}}, ¡tu {{2}} {{3}} ({{4}}) está listo para entrega! Saldo por liquidar: {{5}}. Te esperamos.",
  estado:
    "Hola {{1}}, así va tu {{2}} {{3}}: {{4}}. Promesa de entrega: {{5}}. Seguimiento: {{6}}",
};

type PlantillaWhatsapp = { name: string; language: string };

export type ConfigTaller = {
  simularEnvio: boolean;
  avisarAlMarcarListo: boolean;
  canalId: bigint | null;
  plantillas: Record<TipoNotificacionTaller, PlantillaWhatsapp | null>;
  leyendaRecepcion: string;
};

const texto = (valor: unknown, maximo: number) => {
  const limpio = String(valor ?? "").trim();
  return limpio && limpio.length <= maximo ? limpio : null;
};

const booleano = (valor: unknown) => valor === true || valor === "true" || valor === 1 || valor === "1";

function plantillaDe(valor: unknown): PlantillaWhatsapp | null {
  if (!valor || typeof valor !== "object") return null;
  const objeto = valor as Record<string, unknown>;
  const name = texto(objeto.name, 160);
  const language = texto(objeto.language, 20);
  return name && language ? { name, language } : null;
}

function idDe(valor: unknown): bigint | null {
  const limpio = String(valor ?? "");
  return /^\d+$/.test(limpio) ? BigInt(limpio) : null;
}

export function configTaller(config: unknown): ConfigTaller {
  const valor = (config && typeof config === "object" && !Array.isArray(config) ? config : {}) as Record<string, unknown>;
  return {
    simularEnvio: booleano(valor.simularEnvio),
    avisarAlMarcarListo: booleano(valor.avisarAlMarcarListo),
    canalId: idDe(valor.canalId),
    plantillas: {
      aprobacion: plantillaDe(valor.plantillaAprobacion),
      listo: plantillaDe(valor.plantillaListo),
      estado: plantillaDe(valor.plantillaEstado),
    },
    leyendaRecepcion: texto(valor.leyendaRecepcion, 2000) ?? LEYENDA_RECEPCION_POR_DEFECTO,
  };
}

export function monedaTallerTexto(valor: number | string) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(valor));
}

export function fechaTaller(valor: Date | string | null | undefined, conHora = false) {
  if (!valor) return "sin fecha";
  return new Date(valor).toLocaleString("es-MX", {
    ...(conHora ? { dateStyle: "long", timeStyle: "short" } : { dateStyle: "long" }),
    timeZone: ZONA_TALLER,
  });
}

export type DatosMensajeTaller = {
  nombre: string;
  taller: string;
  marcaVehiculo: string;
  modelo: string;
  placa: string;
  saldo?: number;
  estado?: string;
  fechaPromesa?: Date | string | null;
  enlaceAprobacion?: string | null;
  enlaceSeguimiento?: string | null;
};

export function mensajeTaller(tipo: TipoNotificacionTaller, datos: DatosMensajeTaller) {
  const firma = datos.taller ? `\n\n${datos.taller}` : "";
  const vehiculo = `${datos.marcaVehiculo} ${datos.modelo} (${datos.placa})`;
  if (tipo === "aprobacion") {
    return `Hola ${datos.nombre}, tu ${vehiculo} ya tiene diagnóstico. Revisa y aprueba la cotización aquí: ${datos.enlaceAprobacion ?? ""}${firma}`;
  }
  if (tipo === "listo") {
    const saldo = Number(datos.saldo ?? 0);
    const saldoTexto = saldo > 0 ? ` Saldo por liquidar: ${monedaTallerTexto(saldo)}.` : "";
    return `Hola ${datos.nombre}, ¡tu ${vehiculo} está listo para entrega!${saldoTexto} Te esperamos.${firma}`;
  }
  return `Hola ${datos.nombre}, así va tu ${datos.marcaVehiculo} ${datos.modelo}: ${textoEstadoTaller(datos.estado ?? "")}. Promesa de entrega: ${fechaTaller(datos.fechaPromesa, true)}. Seguimiento: ${datos.enlaceSeguimiento ?? ""}${firma}`;
}

export function variablesPlantillaTaller(tipo: TipoNotificacionTaller, datos: DatosMensajeTaller) {
  if (tipo === "aprobacion") {
    return [datos.nombre, datos.marcaVehiculo, datos.modelo, datos.placa, datos.enlaceAprobacion ?? ""];
  }
  if (tipo === "listo") {
    return [datos.nombre, datos.marcaVehiculo, datos.modelo, datos.placa, monedaTallerTexto(Number(datos.saldo ?? 0))];
  }
  return [
    datos.nombre,
    datos.marcaVehiculo,
    datos.modelo,
    textoEstadoTaller(datos.estado ?? ""),
    fechaTaller(datos.fechaPromesa, true),
    datos.enlaceSeguimiento ?? "",
  ];
}
