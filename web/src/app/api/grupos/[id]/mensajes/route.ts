import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { getProvider, type TipoMensaje } from "@/lib/channel";
import { getMensajesGrupo, marcarGrupoLeido } from "@/lib/services/grupos";
import { guardarMediaBase64 } from "@/lib/storage";
import { serializar } from "@/lib/serialize";

export const dynamic = "force-dynamic";

function tipoDesdeMime(mime: string): TipoMensaje {
  if (mime.startsWith("image/")) return "imagen";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "documento";
}

/** Mensajes del grupo + lo marca como leído. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await requireSesion();
  if ("error" in s) return s.error;

  const id = BigInt(params.id);
  const mensajes = await getMensajesGrupo(id);
  await marcarGrupoLeido(id);
  return NextResponse.json({ mensajes: serializar(mensajes) });
}

/** Enviar al grupo. Body: { texto } o { mediaBase64, mediaMime, caption } */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await requireSesion();
  if ("error" in s) return s.error;

  const grupo = await db.grupo.findUnique({ where: { id: BigInt(params.id) }, include: { canal: true } });
  if (!grupo) return NextResponse.json({ error: "grupo inexistente" }, { status: 404 });

  const { texto, mediaBase64, mediaMime, caption } = await req.json().catch(() => ({}));
  const provider = getProvider(grupo.canal?.proveedor ?? "evolution", grupo.canal?.config, grupo.canal?.instancia);

  let envio;
  let datos: { tipo: TipoMensaje; contenido: string | null; mediaUrl: string | null; mediaMime: string | null };

  if (mediaBase64) {
    const tipo = tipoDesdeMime(mediaMime ?? "");
    envio = await provider.enviarMedia(grupo.jid, mediaBase64, tipo, caption?.trim() || undefined, mediaMime);
    const urlLocal = await guardarMediaBase64(mediaBase64, mediaMime ?? "application/octet-stream");
    datos = { tipo, contenido: caption?.trim() || null, mediaUrl: urlLocal, mediaMime: mediaMime ?? null };
  } else {
    if (!texto?.trim()) return NextResponse.json({ error: "falta texto" }, { status: 400 });
    envio = await provider.enviarTexto(grupo.jid, texto);
    datos = { tipo: "texto", contenido: texto, mediaUrl: null, mediaMime: null };
  }

  const mensaje = await db.mensajeGrupo.create({
    data: {
      grupoId: grupo.id,
      direccion: "saliente",
      tipo: datos.tipo,
      contenido: datos.contenido,
      mediaUrl: datos.mediaUrl,
      mediaMime: datos.mediaMime,
      status: envio.ok ? "enviado" : "fallido",
      waMessageId: envio.waMessageId,
      enviadoPor: s.userId
    }
  });
  await db.grupo.update({ where: { id: grupo.id }, data: { ultimoMensajeAt: new Date() } });

  if (!envio.ok) return NextResponse.json({ ok: false, error: envio.error, mensaje: serializar(mensaje) }, { status: 502 });
  return NextResponse.json({ ok: true, mensaje: serializar(mensaje) });
}
