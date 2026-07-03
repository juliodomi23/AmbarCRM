import { db } from "@/lib/db";
import { getProvider } from "@/lib/channel";
import { getAjustes } from "@/lib/services/config";

const CSAT_DEFAULT = "¿Cómo calificarías nuestra atención del 1 (mala) al 5 (excelente)? Responde solo con el número 🙏";

/** Envía la encuesta CSAT al cerrar la conversación (una sola vez). */
export async function enviarCsat(conversacionId: bigint) {
  const ajustes = await getAjustes();
  if (!ajustes.csatActivo) return;

  const conv = await db.conversacion.findUnique({
    where: { id: conversacionId },
    include: { contacto: true, canal: true }
  });
  if (!conv || conv.csatEnviadoAt || !conv.contacto.telefono) return;

  const provider = getProvider(conv.canal?.proveedor ?? "evolution", conv.canal?.config, conv.canal?.instancia);
  const texto = ajustes.csatTexto?.trim() || CSAT_DEFAULT;
  const envio = await provider.enviarTexto(conv.contacto.telefono, texto);

  await db.mensaje.create({
    data: {
      conversacionId,
      direccion: "saliente",
      tipo: "texto",
      contenido: texto,
      status: envio.ok ? "enviado" : "fallido",
      waMessageId: envio.waMessageId
    }
  });
  await db.conversacion.update({
    where: { id: conversacionId },
    data: { csatEnviadoAt: new Date(), ultimoMensajeAt: new Date() }
  });
}

/** Si la conversación espera CSAT y el mensaje trae un 1-5, lo guarda. Devuelve true si capturó. */
export async function capturarCsat(
  conv: { id: bigint; csatEnviadoAt: Date | null; csatScore: number | null },
  contenido: string | null | undefined
): Promise<boolean> {
  if (!conv.csatEnviadoAt || conv.csatScore != null || !contenido) return false;
  const m = contenido.trim().match(/^([1-5])$/);
  if (!m) return false;
  await db.conversacion.update({ where: { id: conv.id }, data: { csatScore: Number(m[1]) } });
  return true;
}
