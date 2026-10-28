import { etiquetasDeContacto, listarConversaciones, listarPlantillas } from "@/lib/services/chat";
import { getEmbudosConEtapas, listarCanales } from "@/lib/services/config";
import { listarUsuariosActivos, listarEtiquetas } from "@/lib/services/contactos";
import { serializar } from "@/lib/serialize";
import { getSesion } from "@/lib/session";
import { ChatCliente, type ConversacionItem } from "@/components/chat/ChatCliente";
import { tipoCanal, tiposDeBandeja } from "@/lib/channel/tipo-canal";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ conv?: string }> }) {
  const { conv } = await searchParams;
  const canalesRaw = await listarCanales();
  const canales = serializar(canalesRaw).map((c: any) => ({
    id: c.id,
    nombre: c.nombre,
    proveedor: c.proveedor,
    activo: c.activo
  }));
  const directa = conv && /^\d{1,18}$/.test(conv) ? await db.conversacion.findUnique({
    where: { id: BigInt(conv) }, select: { canal: { select: { proveedor: true } } },
  }) : null;
  const { disponibles: tiposDisponibles, inicial: primerTipoConCanal } = tiposDeBandeja(canales);
  const tipoDirecto = directa ? tipoCanal(directa.canal?.proveedor) : undefined;
  const tipoInicial = tipoDirecto && tiposDisponibles.includes(tipoDirecto) ? tipoDirecto : primerTipoConCanal;
  const [convsRaw, plantillasRaw, embudosRaw, usuariosRaw, etiquetasRaw, sesion] = await Promise.all([
    listarConversaciones(tipoInicial),
    listarPlantillas(),
    getEmbudosConEtapas(),
    listarUsuariosActivos(),
    listarEtiquetas(),
    getSesion()
  ]);
  const convs = serializar(convsRaw);
  const plantillas = serializar(plantillasRaw);

  const conversaciones: ConversacionItem[] = convs.map((c: any) => ({
    id: c.id,
    contacto: { id: c.contacto.id, nombre: c.contacto.nombre, telefono: c.contacto.telefono },
    esPersonal: c.contacto.esPersonal ?? false,
    fijado: !!c.fijadoAt,
    responsableId: c.responsable?.id ?? null,
    noLeidos: c.noLeidos,
    ultimoMensajeAt: c.ultimoMensajeAt,
    preview: c.mensajes[0]?.contenido ?? (c.mensajes[0] ? `[${c.mensajes[0].tipo}]` : ""),
    estado: c.estado,
    etiquetas: etiquetasDeContacto(c.contacto),
    canalId: c.canal?.id ?? null,
    canalNombre: c.canal?.nombre ?? "Sin canal",
    canalProveedor: c.canal?.proveedor ?? null,
    ultimoEntranteAt: c.ultimoEntranteAt,
    canalActivo: c.canal?.activo ?? true,
    botActivo: c.botActivo
  }));

  const embudos = serializar(embudosRaw).map((e: any) => ({
    id: e.id,
    nombre: e.nombre,
    etapas: e.etapas.map((et: any) => ({ id: et.id, nombre: et.nombre }))
  }));
  const usuarios = serializar(usuariosRaw).map((u: any) => ({ id: u.id, nombre: u.nombre }));
  const etiquetas = serializar(etiquetasRaw).map((e: any) => ({ id: e.id, nombre: e.nombre, color: e.color }));
  const usuarioId = sesion?.user?.id ?? undefined;
  return (
    <ChatCliente
      conversaciones={conversaciones}
      plantillas={plantillas}
      embudos={embudos}
      usuarios={usuarios}
      etiquetas={etiquetas}
      canales={canales}
      tipoInicial={tipoInicial}
      usuarioId={usuarioId}
      humanAgentHabilitado={process.env.META_HUMAN_AGENT_APROBADO === "true"}
    />
  );
}
