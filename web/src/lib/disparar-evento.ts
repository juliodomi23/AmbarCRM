import { emitirEvento } from "@/lib/webhooks-salientes";
import type { DatosEvento, EventoCrm } from "@/lib/eventos-crm";

export type ContextoEvento = {
  conversacionId: string;
  contactoNuevo?: boolean;
  texto?: string;
  origen: "contacto" | "agente" | "bot" | "automatizacion";
};

export function dispararEvento(orgId: bigint, evento: EventoCrm, datos: DatosEvento, contexto?: ContextoEvento) {
  emitirEvento(orgId, evento, datos);
  void contexto;
}
