import { listarConversaciones, listarPlantillas } from "@/lib/services/chat";
import { getEmbudosConEtapas, listarCanales } from "@/lib/services/config";
import { listarUsuariosActivos, listarEtiquetas } from "@/lib/services/contactos";
import { serializar } from "@/lib/serialize";
import { getSesion } from "@/lib/session";
import { ChatCliente, type ConversacionItem } from "@/components/chat/ChatCliente";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const [convsRaw, plantillasRaw, embudosRaw, usuariosRaw, etiquetasRaw, canalesRaw, sesion] = await Promise.all([
    listarConversaciones(),
    listarPlantillas(),
    getEmbudosConEtapas(),
    listarUsuariosActivos(),
    listarEtiquetas(),
    listarCanales(),
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
    etiquetas: c.etiquetas ?? [],
    canalId: c.canal?.id ?? null,
    canalNombre: c.canal?.nombre ?? "Sin canal",
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
  const canales = serializar(canalesRaw).map((c: any) => ({
    id: c.id,
    nombre: c.nombre,
    proveedor: c.proveedor,
    activo: c.activo
  }));

  return (
    <ChatCliente
      conversaciones={conversaciones}
      plantillas={plantillas}
      embudos={embudos}
      usuarios={usuarios}
      etiquetas={etiquetas}
      canales={canales}
      usuarioId={usuarioId}
    />
  );
}
