import { emitirEvento } from "@/lib/webhooks-salientes";
import type { DatosEvento, EventoCrm } from "@/lib/eventos-crm";
import { ejecutarReglas } from "@/lib/automatizaciones";

export type ContextoEvento = {
  conversacionId: string;
  contactoNuevo?: boolean;
  texto?: string;
  origen: "contacto" | "agente" | "bot" | "automatizacion";
};

const pendientes = new Set<Promise<unknown>>();

export function dispararEvento(orgId: bigint, evento: EventoCrm, datos: DatosEvento, contexto?: ContextoEvento) {
  emitirEvento(orgId, evento, datos);
  if (contexto) {
    const tarea = ejecutarReglas(orgId, evento, contexto).catch(() => {});
    pendientes.add(tarea);
    void tarea.finally(() => pendientes.delete(tarea));
  }
}

export async function esperarReglas() {
  await Promise.all([...pendientes]);
}
