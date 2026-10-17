import { db } from "@/lib/db";
import { transaccionTenant } from "@/lib/retail-db";
import { getProvider, destinatarioDelCanal } from "@/lib/channel";
import { estadoVentana } from "@/lib/meta/ventana";
import { aplicarVariables } from "@/lib/plantillas";

export async function enviarRespuestaRegla(orgId: bigint, conversacionId: bigint, plantillaId: bigint) {
  const conv = await db.conversacion.findUnique({ where: { id: conversacionId }, include: { contacto: true, canal: true } });
  const plantilla = await db.plantillaMensaje.findUnique({ where: { id: plantillaId } });
  if (!conv?.canal?.activo || !plantilla || conv.contacto.esPersonal) return "omitida_destino" as const;
  const destinatario = destinatarioDelCanal(conv.canal.proveedor, conv.contacto);
  if (!destinatario) return "omitida_destino" as const;
  if (conv.canal.proveedor !== "api" && !estadoVentana(conv.ultimoEntranteAt).abierta) return "omitida_ventana" as const;
  const texto = aplicarVariables(plantilla.contenido, conv.contacto);
  const proveedor = getProvider(conv.canal.proveedor, conv.canal.config, conv.canal.instancia);
  const envio = await proveedor.enviarTexto(destinatario, texto, {
    conversacionId, ultimoEntranteAt: conv.ultimoEntranteAt, humano: false,
  });
  await transaccionTenant(orgId, async (tx) => {
    await tx.mensaje.create({ data: { conversacionId, direccion: "saliente", tipo: "texto", contenido: texto,
      status: envio.ok ? "enviado" : "fallido", errorDetalle: envio.ok ? null : "No se pudo enviar la respuesta automática",
      waMessageId: envio.waMessageId } });
    if (envio.ok) await tx.conversacion.update({ where: { id: conversacionId }, data: { ultimoMensajeAt: new Date() } });
  });
  return envio.ok ? "ok" as const : "error_envio" as const;
}
