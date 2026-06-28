import { db } from "@/lib/db";
import { getProvider, type MensajeGrupoNormalizado } from "@/lib/channel";
import { instanciaPorDefecto } from "@/lib/channel/evolution";
import { guardarMediaBase64 } from "@/lib/storage";

/** Ingesta de un mensaje entrante de grupo (idempotente por wa_message_id). */
export async function ingestarGrupoEntrante(m: MensajeGrupoNormalizado, canalId: bigint | null) {
  if (m.waMessageId) {
    const existe = await db.mensajeGrupo.findUnique({ where: { waMessageId: m.waMessageId } });
    if (existe) return { duplicado: true as const };
  }

  const canal = canalId ? await db.canalWhatsapp.findUnique({ where: { id: canalId } }) : null;
  const provider = getProvider(canal?.proveedor ?? "evolution");
  const instancia = canal?.instancia?.trim() || instanciaPorDefecto;

  // Grupo (lo crea con su nombre real la primera vez).
  let grupo = await db.grupo.findFirst({ where: { jid: m.grupoJid } });
  if (!grupo) {
    let nombre = m.grupoJid.split("@")[0];
    if (provider.infoGrupo) {
      const info = await provider.infoGrupo(instancia, m.grupoJid).catch(() => null);
      if (info?.nombre) nombre = info.nombre;
    }
    grupo = await db.grupo.create({ data: { jid: m.grupoJid, nombre, canalId: canalId ?? undefined } });
  }

  // Media cifrada: descargar y guardar local.
  let mediaUrl = m.mediaUrl;
  let mediaMime = m.mediaMime;
  if (m.tipo !== "texto" && m.raw && provider.descargarMedia) {
    const media = await provider.descargarMedia(m.raw, instancia);
    if (media) {
      mediaUrl = await guardarMediaBase64(media.base64, media.mime);
      mediaMime = media.mime;
    }
  }

  await db.mensajeGrupo.create({
    data: {
      grupoId: grupo.id,
      direccion: "entrante",
      tipo: m.tipo,
      contenido: m.contenido,
      mediaUrl,
      mediaMime,
      remitente: m.remitenteNombre || m.remitenteTel || null,
      remitenteTel: m.remitenteTel || null,
      status: "entregado",
      waMessageId: m.waMessageId,
      timestamp: m.timestamp
    }
  });
  await db.grupo.update({
    where: { id: grupo.id },
    data: { noLeidos: { increment: 1 }, ultimoMensajeAt: m.timestamp }
  });

  return { duplicado: false as const, grupoId: grupo.id };
}

export function listarGrupos() {
  return db.grupo.findMany({
    orderBy: { ultimoMensajeAt: "desc" },
    include: { mensajes: { orderBy: { timestamp: "desc" }, take: 1 } }
  });
}

export function getMensajesGrupo(grupoId: bigint) {
  return db.mensajeGrupo.findMany({ where: { grupoId }, orderBy: { timestamp: "asc" } });
}

export function marcarGrupoLeido(grupoId: bigint) {
  return db.grupo.update({ where: { id: grupoId }, data: { noLeidos: 0 } });
}
