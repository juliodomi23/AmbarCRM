"use client";

// Chat: ChatCliente real con las mismas props que arma app/(app)/chat/page.tsx, desde el almacén.
import { ChatCliente } from "@/components/chat/ChatCliente";
import { useDatos } from "@/lib/demo/usar-almacen";
import { embudosConEtapas, listaConversaciones, sesionDemo } from "@/lib/demo/vistas";

export function PantallaChat() {
  const d = useDatos();
  return (
    <ChatCliente
      conversaciones={listaConversaciones(d)}
      plantillas={d.plantillas}
      embudos={embudosConEtapas(d).map((e) => ({ id: e.id, nombre: e.nombre, etapas: e.etapas.map((et) => ({ id: et.id, nombre: et.nombre })) }))}
      usuarios={d.usuarios.filter((u) => u.activo).map((u) => ({ id: u.id, nombre: u.nombre }))}
      etiquetas={d.etiquetas}
      canales={[]}
      usuarioId={sesionDemo(d).id}
    />
  );
}
