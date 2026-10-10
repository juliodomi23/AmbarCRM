import { getProvider, type PlantillaOficial } from "@/lib/channel";
import { db } from "@/lib/db";
import { estadoVentana } from "@/lib/meta/ventana";
import type { ConfigPedidos } from "@/lib/pedidos";

/** Envía solo por un canal oficial y respeta la ventana de Meta; la falta de canal no invalida el pedido. */
export async function avisarClientePedido(ventaId: bigint, config: ConfigPedidos) {
  const venta = await db.venta.findUnique({
    where: { id: ventaId },
    include: { contacto: { include: { conversaciones: { where: { canal: { activo: true, proveedor: "cloud_api" } }, include: { canal: true }, orderBy: { ultimoMensajeAt: "desc" }, take: 1 } } } },
  });
  const conversacion = venta?.contacto?.conversaciones[0];
  if (!venta?.contacto?.telefono || !conversacion?.canal) return { forma: "omitido" as const };
  const ultimoEntrante = await db.mensaje.findFirst({
    where: { conversacionId: conversacion.id, direccion: "entrante" },
    orderBy: { timestamp: "desc" }, select: { timestamp: true },
  });
  const ventanaAbierta = estadoVentana(ultimoEntrante?.timestamp).abierta;
  if (!ventanaAbierta && !config.plantillaPedido) return { forma: "omitido" as const };
  const baseUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/+$/, "");
  if (!baseUrl || !venta.tokenSeguimiento) return { forma: "omitido" as const };
  const enlace = `${baseUrl}/tienda/pedido/${venta.tokenSeguimiento}`;
  const texto = `Recibimos tu pedido ${venta.folio} por $${venta.total.toFixed(2)}. Síguelo aquí: ${enlace}`;
  const provider = getProvider("cloud_api", conversacion.canal.config, conversacion.canal.instancia);
  let resultado;
  let tipo: "texto" | "plantilla";
  if (ventanaAbierta) {
    tipo = "texto";
    resultado = await provider.enviarTexto(venta.contacto.telefono, texto);
  } else {
    tipo = "plantilla";
    if (!provider.enviarPlantilla || !provider.listarPlantillas) return { forma: "omitido" as const };
    const disponibles = await provider.listarPlantillas();
    const aprobada = disponibles.find((plantilla: PlantillaOficial) => plantilla.name === config.plantillaPedido!.name && plantilla.status === "APPROVED");
    if (!aprobada) return { forma: "omitido" as const };
    resultado = await provider.enviarPlantilla(venta.contacto.telefono, config.plantillaPedido!, [venta.contacto.nombre, venta.folio, enlace]);
  }
  await db.mensaje.create({ data: {
    conversacionId: conversacion.id, direccion: "saliente", tipo,
    contenido: tipo === "plantilla" ? `[Plantilla ${config.plantillaPedido!.name}] ${texto}` : texto,
    status: resultado.ok ? "enviado" : "fallido", errorDetalle: resultado.ok ? null : resultado.error,
    waMessageId: resultado.waMessageId,
  } });
  return { forma: tipo };
}
