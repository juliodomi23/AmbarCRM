import { db } from "@/lib/db";
import { getProvider } from "@/lib/channel";
import { estadoVentana } from "@/lib/meta/ventana";
import { ErrorRetail } from "@/lib/retail-db";
import { saldoCobro } from "@/lib/ar-vistas";

/** Solo lo llama la acción manual de Cobros. El cron y el seed no importan este servicio. */
export async function recordarCobro(id: bigint) {
  const cobro = await db.cobro.findFirst({ where: { id }, include: { contrato: { include: { contacto: { include: { conversaciones: {
    where: { canal: { activo: true, proveedor: "cloud_api" } }, include: { canal: true }, orderBy: { ultimoMensajeAt: "desc" }, take: 1,
  } } } } } } });
  if (!cobro) throw new ErrorRetail("Cobro inexistente", 404);
  if (!["pendiente", "vencido"].includes(cobro.estado)) throw new ErrorRetail("Solo se recuerdan cobros pendientes", 409);
  const contacto = cobro.contrato.contacto;
  const conversacion = contacto.conversaciones[0];
  if (!contacto.telefono || /000000/.test(contacto.telefono) || !conversacion?.canal) throw new ErrorRetail("Sin teléfono y conversación oficial disponibles", 409);
  const modulo = await db.moduloOrg.findFirst({ where: { clave: "cobros", activo: true } });
  const config = (modulo?.config ?? {}) as Record<string, unknown>;
  const plantilla = config.plantillaCobro as { name?: string; language?: string } | null;
  const ultimo = await db.mensaje.findFirst({ where: { conversacionId: conversacion.id, direccion: "entrante" }, orderBy: { timestamp: "desc" }, select: { timestamp: true } });
  const abierta = estadoVentana(ultimo?.timestamp).abierta;
  if (!abierta && (!plantilla?.name || !plantilla?.language)) throw new ErrorRetail("Fuera de la ventana de 24 h se necesita una plantilla aprobada", 409);
  const provider = getProvider("cloud_api", conversacion.canal.config, conversacion.canal.instancia);
  const vencimiento = cobro.vence?.toISOString().slice(0, 10) ?? "por definir";
  const saldo = saldoCobro(cobro).toFixed(2);
  const texto = `Hola ${contacto.nombre}, te recordamos el saldo de ${cobro.concepto} por $${saldo} MXN, vencimiento ${vencimiento}.`;
  let resultado;
  if (abierta) resultado = await provider.enviarTexto(contacto.telefono, texto);
  else {
    if (!provider.listarPlantillas || !provider.enviarPlantilla) throw new ErrorRetail("El canal no admite plantillas", 409);
    const aprobada = (await provider.listarPlantillas()).find((item) => item.name === plantilla!.name && item.language === plantilla!.language && item.status === "APPROVED");
    if (!aprobada) throw new ErrorRetail("La plantilla configurada no está aprobada", 409);
    resultado = await provider.enviarPlantilla(contacto.telefono, { name: aprobada.name, language: aprobada.language }, [contacto.nombre, saldo, vencimiento]);
  }
  await db.mensaje.create({ data: { conversacionId: conversacion.id, direccion: "saliente", tipo: abierta ? "texto" : "plantilla", contenido: texto, status: resultado.ok ? "enviado" : "fallido", errorDetalle: resultado.ok ? null : resultado.error, waMessageId: resultado.waMessageId } });
  if (!resultado.ok) throw new ErrorRetail("El canal no pudo enviar el recordatorio", 409);
  return { ok: true, forma: abierta ? "texto" : "plantilla" };
}
