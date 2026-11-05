import { randomBytes } from "node:crypto";
import { getProvider, type PlantillaOficial } from "@/lib/channel";
import { db } from "@/lib/db";
import { estadoVentana } from "@/lib/meta/ventana";
import { telefonoMx } from "@/lib/reservas/telefono";
import {
  configTaller,
  mensajeTaller,
  variablesPlantillaTaller,
  type DatosMensajeTaller,
  type FormaEnvioTaller,
  type TipoNotificacionTaller,
} from "@/lib/taller-mensajes";

export * from "@/lib/taller-mensajes";

export class ErrorTaller extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly codigo?: string,
  ) {
    super(message);
    this.name = "ErrorTaller";
  }
}

function baseUrlPublica() {
  const base = (process.env.NEXTAUTH_URL ?? "").replace(/\/+$/, "");
  if (!base) throw new ErrorTaller("Configura NEXTAUTH_URL para generar los enlaces públicos", 409, "sin_url_publica");
  return base;
}

export function enlaceAprobacionTaller(orgId: bigint, token: string) {
  return `${baseUrlPublica()}/taller-aprobacion/${orgId}-${token}`;
}

export function enlaceSeguimientoTaller(orgId: bigint, token: string) {
  return `${baseUrlPublica()}/taller-estado/${orgId}-${token}`;
}

export function enlaceWhatsappManual(telefono: string, mensaje: string) {
  const normalizado = telefonoMx(telefono);
  return normalizado ? `https://wa.me/52${normalizado}?text=${encodeURIComponent(mensaje)}` : null;
}

/** Genera el token de seguimiento la primera vez que se necesita (idempotente y seguro entre peticiones). */
export async function asegurarTokenSeguimiento(ordenId: bigint, actual?: string | null) {
  if (actual) return actual;
  for (let intento = 0; intento < 3; intento += 1) {
    const token = randomBytes(24).toString("hex");
    const resultado = await db.tallerOrden.updateMany({
      where: { id: ordenId, seguimientoToken: null },
      data: { seguimientoToken: token },
    });
    if (resultado.count) return token;
    const orden = await db.tallerOrden.findUnique({ where: { id: ordenId }, select: { seguimientoToken: true } });
    if (orden?.seguimientoToken) return orden.seguimientoToken;
  }
  throw new ErrorTaller("No se pudo generar el enlace de seguimiento", 500);
}

const MINUTOS_LIMITE = 10;

export type ResultadoMensajeTaller = {
  forma: FormaEnvioTaller;
  mensaje: string;
  enlaceWhatsapp: string | null;
};

/**
 * Envía al cliente el aviso del taller. Orden de decisión: modo simulado → canal oficial
 * (texto dentro de la ventana de 24 h o plantilla aprobada) → respaldo manual con wa.me.
 * Cada intento queda auditado en `taller_notificaciones` y, si hay conversación, en `mensajes`.
 */
export async function enviarMensajeTaller(
  ordenId: bigint,
  tipo: TipoNotificacionTaller,
  usuarioId: bigint | null,
): Promise<ResultadoMensajeTaller> {
  const orden = await db.tallerOrden.findUnique({
    where: { id: ordenId },
    include: {
      vehiculo: {
        select: {
          contactoId: true,
          placa: true,
          marca: true,
          modelo: true,
          contacto: { select: { nombre: true, telefono: true } },
        },
      },
    },
  });
  if (!orden) throw new ErrorTaller("Orden no encontrada", 404);
  const modulo = await db.moduloOrg.findFirst({ where: { clave: "taller", activo: true }, select: { config: true } });
  if (!modulo) throw new ErrorTaller("El módulo Taller no está activo", 404);
  const config = configTaller(modulo.config);

  const reciente = await db.tallerNotificacion.findFirst({
    where: { ordenId, tipo, createdAt: { gte: new Date(Date.now() - MINUTOS_LIMITE * 60_000) } },
    select: { id: true },
  });
  if (reciente) {
    throw new ErrorTaller(
      `Ya se envió este aviso hace menos de ${MINUTOS_LIMITE} minutos. Espera antes de reenviarlo.`,
      409,
      "limite_reenvio",
    );
  }

  const ajustes = await db.ajustes.findUnique({ where: { orgId: orden.orgId }, select: { marcaNombre: true } });
  const pagos = await db.tallerPago.aggregate({ where: { ordenId }, _sum: { monto: true } });
  const saldo = Math.max(0, Number(orden.total) - Number(pagos._sum.monto ?? 0));

  const datos: DatosMensajeTaller = {
    nombre: orden.vehiculo.contacto.nombre,
    taller: ajustes?.marcaNombre?.trim() || "",
    marcaVehiculo: orden.vehiculo.marca,
    modelo: orden.vehiculo.modelo,
    placa: orden.vehiculo.placa,
    saldo,
    estado: orden.estado,
    fechaPromesa: orden.fechaPromesa,
  };

  if (tipo === "aprobacion") {
    if (!orden.aprobacionToken) {
      throw new ErrorTaller("Genera primero la liga de aprobación del cliente", 409, "sin_enlace_aprobacion");
    }
    datos.enlaceAprobacion = enlaceAprobacionTaller(orden.orgId, orden.aprobacionToken);
  }
  if (tipo === "estado") {
    const token = await asegurarTokenSeguimiento(orden.id, orden.seguimientoToken);
    datos.enlaceSeguimiento = enlaceSeguimientoTaller(orden.orgId, token);
  }

  const mensaje = mensajeTaller(tipo, datos);

  if (config.simularEnvio) {
    await db.tallerNotificacion.create({
      data: { ordenId, tipo, forma: "simulado", estado: "simulado", userId: usuarioId },
    });
    return { forma: "simulado", mensaje, enlaceWhatsapp: null };
  }

  const conversacion = await db.conversacion.findFirst({
    where: { contactoId: orden.vehiculo.contactoId, canal: { activo: true, proveedor: "cloud_api" } },
    include: { canal: true },
    orderBy: { ultimoMensajeAt: "desc" },
  });

  if (!conversacion?.canal || !orden.vehiculo.contacto.telefono) {
    const enlaceWhatsapp = enlaceWhatsappManual(orden.vehiculo.contacto.telefono ?? "", mensaje);
    if (!enlaceWhatsapp) {
      throw new ErrorTaller(
        "El cliente no tiene teléfono válido ni una conversación de WhatsApp oficial. Registra su teléfono para enviarle el aviso.",
        409,
        "sin_telefono",
      );
    }
    await db.tallerNotificacion.create({
      data: { ordenId, tipo, forma: "manual", estado: "manual", userId: usuarioId },
    });
    return { forma: "manual", mensaje, enlaceWhatsapp };
  }

  const ultimoEntrante = await db.mensaje.findFirst({
    where: { conversacionId: conversacion.id, direccion: "entrante" },
    orderBy: { timestamp: "desc" },
    select: { timestamp: true },
  });
  const ventanaAbierta = estadoVentana(ultimoEntrante?.timestamp).abierta;
  const plantilla = config.plantillas[tipo];
  if (!ventanaAbierta && !plantilla) {
    throw new ErrorTaller(
      "La ventana de 24 h está cerrada; configura una plantilla aprobada para el taller",
      409,
      "ventana_cerrada_sin_plantilla",
    );
  }

  const provider = getProvider("cloud_api", conversacion.canal.config, conversacion.canal.instancia);
  let resultado;
  if (ventanaAbierta) {
    resultado = await provider.enviarTexto(orden.vehiculo.contacto.telefono, mensaje);
  } else {
    if (!provider.enviarPlantilla || !provider.consultarPlantillas) {
      throw new ErrorTaller("El canal no admite plantillas", 409, "canal_sin_plantillas");
    }
    const consulta = await provider.consultarPlantillas();
    if (!consulta.ok) {
      if (consulta.motivo === "sin_waba") {
        throw new ErrorTaller(
          "El canal no tiene la cuenta de WhatsApp Business (WABA) configurada; no se pueden consultar plantillas",
          409,
          "canal_sin_waba",
        );
      }
      if (consulta.motivo === "no_disponible") {
        throw new ErrorTaller("WhatsApp no respondió al consultar las plantillas; intenta de nuevo", 503, "meta_no_disponible");
      }
      throw new ErrorTaller(`WhatsApp rechazó la consulta de plantillas: ${consulta.error}`, 502, "meta_rechazo");
    }
    const aprobada = consulta.plantillas.find(
      (item: PlantillaOficial) => item.name === plantilla!.name && item.status === "APPROVED",
    );
    if (!aprobada) {
      throw new ErrorTaller("La plantilla del taller no está aprobada en Meta", 409, "plantilla_no_aprobada");
    }
    resultado = await provider.enviarPlantilla(
      orden.vehiculo.contacto.telefono,
      plantilla!,
      variablesPlantillaTaller(tipo, datos),
    );
  }

  await db.mensaje.create({
    data: {
      conversacionId: conversacion.id,
      direccion: "saliente",
      tipo: ventanaAbierta ? "texto" : "plantilla",
      contenido: ventanaAbierta ? mensaje : `[Plantilla ${plantilla!.name}] ${mensaje}`,
      status: resultado.ok ? "enviado" : "fallido",
      errorDetalle: resultado.ok ? null : (resultado.error ?? "No se pudo enviar"),
      waMessageId: resultado.waMessageId,
      enviadoPor: usuarioId,
    },
  });
  await db.tallerNotificacion.create({
    data: {
      ordenId,
      tipo,
      forma: "oficial",
      estado: resultado.ok ? "enviado" : "fallido",
      error: resultado.ok ? null : (resultado.error ?? "No se pudo enviar"),
      userId: usuarioId,
    },
  });
  if (!resultado.ok) throw new ErrorTaller(resultado.error ?? "No se pudo enviar el mensaje", 502);
  return { forma: "oficial", mensaje, enlaceWhatsapp: null };
}

/** Texto que verá el cliente en el modo simulado o como vista previa en la UI. */
export function vistaPreviaTaller(tipo: TipoNotificacionTaller, datos: DatosMensajeTaller) {
  return mensajeTaller(tipo, datos);
}
