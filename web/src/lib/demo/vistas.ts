// Mapeos del almacén a las formas que los componentes reales esperan. Replican lo que hacen los
// page.tsx y las rutas /api del CRM (misma estructura, mismos nombres) pero leyendo del almacén.
import type { ConversacionItem } from "@/components/chat/ChatCliente";
import type { Datos, ContactoD, ConversacionD, MensajeD } from "./tipos";

export const contactoDe = (d: Datos, id: string) => d.contactos.find((c) => c.id === id);
export const usuarioDe = (d: Datos, id: string | null) => (id ? d.usuarios.find((u) => u.id === id) : undefined);
export const sesionDemo = (d: Datos) => d.usuarios[0];

export function etiquetasDeContacto(d: Datos, c: ContactoD) {
  return c.etiquetaIds.map((id) => d.etiquetas.find((e) => e.id === id)?.nombre).filter(Boolean) as string[];
}

export function ultimoMensaje(d: Datos, conversacionId: string): MensajeD | undefined {
  let ultimo: MensajeD | undefined;
  for (const m of d.mensajes) {
    if (m.conversacionId === conversacionId && (!ultimo || m.timestamp >= ultimo.timestamp)) ultimo = m;
  }
  return ultimo;
}

export function itemConversacion(d: Datos, c: ConversacionD): ConversacionItem {
  const contacto = contactoDe(d, c.contactoId)!;
  const ultimo = ultimoMensaje(d, c.id);
  return {
    id: c.id,
    contacto: { id: contacto.id, nombre: contacto.nombre, telefono: contacto.telefono },
    esPersonal: contacto.esPersonal,
    fijado: !!c.fijadoAt,
    responsableId: c.responsableId,
    noLeidos: c.noLeidos,
    ultimoMensajeAt: c.ultimoMensajeAt,
    preview: ultimo?.contenido ?? (ultimo ? `[${ultimo.tipo}]` : ""),
    estado: c.estado,
    etiquetas: etiquetasDeContacto(d, contacto),
    canalId: c.canalId,
    canalNombre: "Sin canal",
    canalActivo: true,
    botActivo: c.botActivo,
  };
}

/** Bandeja: fijados primero, luego lo más reciente (igual que listarConversaciones). */
export function listaConversaciones(d: Datos, soloIds?: Set<string>): ConversacionItem[] {
  return d.conversaciones
    .filter((c) => !soloIds || soloIds.has(c.id))
    .slice()
    .sort(
      (a, b) =>
        Number(!!b.fijadoAt) - Number(!!a.fijadoAt) ||
        new Date(b.ultimoMensajeAt ?? 0).getTime() - new Date(a.ultimoMensajeAt ?? 0).getTime(),
    )
    .map((c) => itemConversacion(d, c));
}

export function detalleConversacion(d: Datos, c: ConversacionD) {
  const contacto = contactoDe(d, c.contactoId)!;
  return {
    id: c.id,
    estado: c.estado,
    botActivo: c.botActivo,
    etiquetas: etiquetasDeContacto(d, contacto),
    responsableId: c.responsableId,
    contacto: {
      id: contacto.id,
      nombre: contacto.nombre,
      telefono: contacto.telefono,
      email: contacto.email,
      empresa: contacto.empresa,
      notas: contacto.notas,
      campos: contacto.campos,
      esPersonal: contacto.esPersonal,
    },
    oportunidades: d.oportunidades
      .filter((o) => o.contactoId === contacto.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((o) => {
        const etapa = d.etapas.find((e) => e.id === o.etapaId);
        const embudo = d.embudos.find((e) => e.id === o.embudoId);
        return {
          id: o.id,
          titulo: o.titulo,
          valor: o.valor,
          estado: o.estado,
          etapaId: o.etapaId,
          embudoId: o.embudoId,
          etapa: etapa?.nombre ?? null,
          embudo: embudo?.nombre ?? null,
        };
      }),
  };
}

export function embudosConEtapas(d: Datos) {
  return d.embudos
    .slice()
    .sort((a, b) => a.orden - b.orden)
    .map((e) => ({
      id: e.id,
      nombre: e.nombre,
      orden: e.orden,
      etapas: d.etapas
        .filter((et) => et.embudoId === e.id)
        .sort((a, b) => a.orden - b.orden)
        .map((et) => ({ id: et.id, nombre: et.nombre, color: et.color, tipo: et.tipo, orden: et.orden })),
    }));
}

/** Contadores del AppShell (no leídos y tareas vencidas del usuario de la demo). */
export function contadoresShell(d: Datos) {
  const inicioHoy = new Date();
  inicioHoy.setHours(0, 0, 0, 0);
  const yo = sesionDemo(d).id;
  return {
    noLeidos: d.conversaciones.filter((c) => c.estado !== "cerrada").reduce((s, c) => s + c.noLeidos, 0),
    tareasVencidas: d.tareas.filter((t) => !t.completada && t.venceAt && new Date(t.venceAt) < inicioHoy && t.responsableId === yo).length,
  };
}
