import { getProvider, type PlantillaOficial } from "@/lib/channel";
import { db, runWithOrg } from "@/lib/db";
import { estadoVentana } from "@/lib/meta/ventana";
import { configResenas, type ConfigResenas } from "@/lib/resenas";
import { transaccionTenant } from "@/lib/retail-db";

export type EventoResena =
  | { evento: "cita"; citaId: bigint; contactoId: bigint }
  | { evento: "venta"; ventaId: bigint; contactoId: bigint };

export type ResultadoEnvio =
  | { forma: "texto" | "plantilla"; error?: string; conversacionId: bigint }
  | { forma: "omitido"; motivo: string; conversacionId: bigint | null };

type Enviar = (contactoId: bigint, config: ConfigResenas, enlace: string, negocio: string) => Promise<ResultadoEnvio>;

/**
 * Reserva el cupo del contacto bloqueando su fila: dos eventos simultáneos (cita atendida y venta
 * entregada) se serializan y el segundo ve la reserva del primero. Devuelve null si no toca enviar.
 */
async function reservar(orgId: bigint, evento: EventoResena) {
  return transaccionTenant(orgId, async (tx) => {
    const modulo = await tx.moduloOrg.findFirst({ where: { clave: "resenas", activo: true }, select: { config: true } });
    const config = modulo ? configResenas(modulo.config) : null;
    if (!config?.enlaceGoogle) return null;
    await tx.$queryRaw`SELECT id FROM contactos WHERE id = ${evento.contactoId} FOR UPDATE`;
    const desde = new Date(Date.now() - config.diasEntreSolicitudes * 86_400_000);
    const vigente = await tx.solicitudResena.findFirst({
      where: { contactoId: evento.contactoId, estado: { in: ["reservada", "enviada"] }, createdAt: { gte: desde } },
      select: { id: true },
    });
    if (vigente) return null;
    const solicitud = await tx.solicitudResena.create({
      data: {
        contactoId: evento.contactoId,
        evento: evento.evento,
        citaId: evento.evento === "cita" ? evento.citaId : null,
        ventaId: evento.evento === "venta" ? evento.ventaId : null,
        estado: "reservada",
      },
    });
    return { config, solicitudId: solicitud.id };
  });
}

/** Texto dentro de la ventana de 24 h; fuera, solo con la plantilla aprobada. Sin canal o plantilla: omite. */
async function enviarPorWhatsApp(contactoId: bigint, config: ConfigResenas, enlace: string, negocio: string): Promise<ResultadoEnvio> {
  const contacto = await db.contacto.findUnique({
    where: { id: contactoId },
    include: { conversaciones: { include: { canal: true }, orderBy: { ultimoMensajeAt: "desc" } } },
  });
  const ultima = contacto?.conversaciones[0] ?? null;
  const conversacion = contacto?.conversaciones.find((c) => c.canal?.activo && c.canal.proveedor === "cloud_api");
  if (!contacto?.telefono || !conversacion?.canal) {
    return { forma: "omitido", motivo: "El cliente no tiene un canal oficial de WhatsApp activo", conversacionId: ultima?.id ?? null };
  }
  const ultimoEntrante = await db.mensaje.findFirst({
    where: { conversacionId: conversacion.id, direccion: "entrante" },
    orderBy: { timestamp: "desc" },
    select: { timestamp: true },
  });
  const ventanaAbierta = estadoVentana(ultimoEntrante?.timestamp).abierta;
  if (!ventanaAbierta && !config.plantillaResena) {
    return { forma: "omitido", motivo: "Fuera de la ventana de 24 h y sin plantilla aprobada configurada", conversacionId: conversacion.id };
  }
  const provider = getProvider("cloud_api", conversacion.canal.config, conversacion.canal.instancia);
  const texto = `Gracias por visitarnos en ${negocio}. ¿Nos cuentas cómo te fue? Tu opinión nos ayuda mucho: ${enlace}`;
  let resultado;
  let forma: "texto" | "plantilla";
  if (ventanaAbierta) {
    forma = "texto";
    resultado = await provider.enviarTexto(contacto.telefono, texto);
  } else {
    forma = "plantilla";
    const plantilla = config.plantillaResena!;
    if (!provider.enviarPlantilla || !provider.listarPlantillas) {
      return { forma: "omitido", motivo: "El canal no soporta plantillas", conversacionId: conversacion.id };
    }
    const aprobada = (await provider.listarPlantillas()).find((p: PlantillaOficial) => p.name === plantilla.name && p.status === "APPROVED");
    if (!aprobada) return { forma: "omitido", motivo: `La plantilla ${plantilla.name} no está aprobada`, conversacionId: conversacion.id };
    resultado = await provider.enviarPlantilla(contacto.telefono, plantilla, [contacto.nombre, enlace]);
  }
  await db.mensaje.create({
    data: {
      conversacionId: conversacion.id, direccion: "saliente", tipo: forma,
      contenido: forma === "plantilla" ? `[Plantilla ${config.plantillaResena!.name}] ${texto}` : texto,
      status: resultado.ok ? "enviado" : "fallido", errorDetalle: resultado.ok ? null : resultado.error,
      waMessageId: resultado.waMessageId,
    },
  });
  return { forma, error: resultado.ok ? undefined : resultado.error, conversacionId: conversacion.id };
}

/**
 * Pide una reseña al terminar una cita (completada) o una venta (entregada). Va fuera de la
 * transacción del cambio de estado y nunca lanza: si Meta falla, la cita o la venta ya cambiaron.
 */
export async function solicitarResena(orgId: bigint, evento: EventoResena, enviar: Enviar = enviarPorWhatsApp) {
  try {
    return await runWithOrg(orgId, async () => {
      const reserva = await reservar(orgId, evento);
      if (!reserva) return null;
      let estado: "enviada" | "fallida" | "omitida" = "fallida";
      let detalle: string | null = null;
      let conversacionId: bigint | null = null;
      try {
        const org = await db.org.findUniqueOrThrow({ where: { id: orgId }, select: { slug: true, nombre: true } });
        const base = (process.env.NEXTAUTH_URL ?? "").replace(/\/+$/, "");
        if (!base) {
          estado = "omitida";
          detalle = "NEXTAUTH_URL no está configurada";
        } else {
          const resultado = await enviar(evento.contactoId, reserva.config, `${base}/opinion/${org.slug}?o=whatsapp`, org.nombre);
          conversacionId = resultado.conversacionId;
          if (resultado.forma === "omitido") {
            estado = "omitida";
            detalle = resultado.motivo;
          } else {
            estado = resultado.error ? "fallida" : "enviada";
            detalle = resultado.error ?? resultado.forma;
          }
        }
      } catch (error) {
        detalle = error instanceof Error ? error.message : String(error);
      }
      await db.solicitudResena.update({ where: { id: reserva.solicitudId }, data: { estado, detalle } });
      if (estado !== "enviada" && conversacionId !== null) {
        await db.mensaje.create({
          data: {
            conversacionId, direccion: "saliente", interna: true, status: "enviado",
            contenido: `No se envió la solicitud de reseña: ${detalle}`,
          },
        });
      }
      return { solicitudId: reserva.solicitudId, estado, detalle };
    });
  } catch (error) {
    console.error("[resenas] solicitud automática:", error);
    return null;
  }
}
