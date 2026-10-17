import { ErrorRetail } from "@/lib/retail-db";
import { idIntegracion, objetoEstricto } from "@/lib/integraciones-validacion";

export const DISPARADORES = ["conversacion.creada", "conversacion.estado_cambiado", "mensaje.recibido"] as const;
export const ESTADOS_REGLA = ["abierta", "pendiente", "cerrada"] as const;
export type EstadoRegla = typeof ESTADOS_REGLA[number];
export type CondicionRegla =
  | { tipo: "canal"; valor: "cloud_api" | "messenger" | "api" }
  | { tipo: "estado"; valor: EstadoRegla }
  | { tipo: "etiqueta" | "texto_contiene" | "texto_no_contiene"; valor: string }
  | { tipo: "fuera_horario" | "contacto_nuevo"; valor: boolean };
export type AccionRegla =
  | { tipo: "asignar_agente" | "agregar_etiqueta" | "enviar_plantilla" | "enviar_webhook"; id: string }
  | { tipo: "cambiar_estado"; valor: EstadoRegla };

function deLista<T extends string>(valor: unknown, lista: readonly T[]): T {
  if (typeof valor !== "string" || !lista.includes(valor as T)) throw new ErrorRetail("valor fuera de la lista permitida");
  return valor as T;
}

export function validarCondiciones(valor: unknown): CondicionRegla[] {
  if (!Array.isArray(valor) || valor.length > 10) throw new ErrorRetail("máximo 10 condiciones");
  return valor.map((fila) => {
    const b = objetoEstricto(fila, ["tipo", "valor"]);
    switch (b.tipo) {
      case "canal": return { tipo: b.tipo, valor: deLista(b.valor, ["cloud_api", "messenger", "api"]) };
      case "estado": return { tipo: b.tipo, valor: deLista(b.valor, ESTADOS_REGLA) };
      case "etiqueta": idIntegracion(b.valor); return { tipo: b.tipo, valor: b.valor as string };
      case "texto_contiene": case "texto_no_contiene":
        if (typeof b.valor !== "string" || !b.valor.trim() || b.valor.length > 300) throw new ErrorRetail("texto inválido");
        return { tipo: b.tipo, valor: b.valor.trim() };
      case "fuera_horario": case "contacto_nuevo":
        if (typeof b.valor !== "boolean") throw new ErrorRetail("condición booleana inválida");
        return { tipo: b.tipo, valor: b.valor };
      default: throw new ErrorRetail("condición no permitida");
    }
  });
}

export function validarAcciones(valor: unknown): AccionRegla[] {
  if (!Array.isArray(valor) || !valor.length || valor.length > 5) throw new ErrorRetail("se requieren de 1 a 5 acciones");
  return valor.map((fila) => {
    const b = objetoEstricto(fila);
    if (b.tipo === "cambiar_estado") {
      objetoEstricto(b, ["tipo", "valor"]);
      return { tipo: b.tipo, valor: deLista(b.valor, ESTADOS_REGLA) };
    }
    objetoEstricto(b, ["tipo", "id"]);
    return { tipo: deLista(b.tipo, ["asignar_agente", "agregar_etiqueta", "enviar_plantilla", "enviar_webhook"]), id: String(idIntegracion(b.id)) };
  });
}

export function validarRegla(valor: unknown, parcial = false) {
  const b = objetoEstricto(valor, ["nombre", "evento", "condiciones", "acciones", "activo"]);
  const data: { nombre?: string; evento?: typeof DISPARADORES[number]; condiciones?: CondicionRegla[]; acciones?: AccionRegla[]; activo?: boolean } = {};
  if (!parcial || "nombre" in b) {
    if (typeof b.nombre !== "string" || !b.nombre.trim() || b.nombre.length > 100) throw new ErrorRetail("nombre inválido");
    data.nombre = b.nombre.trim();
  }
  if (!parcial || "evento" in b) data.evento = deLista(b.evento, DISPARADORES);
  if (!parcial || "condiciones" in b) data.condiciones = validarCondiciones(b.condiciones);
  if (!parcial || "acciones" in b) data.acciones = validarAcciones(b.acciones);
  if ("activo" in b) {
    if (typeof b.activo !== "boolean") throw new ErrorRetail("activo inválido");
    data.activo = b.activo;
  }
  if (!Object.keys(data).length) throw new ErrorRetail("nada que actualizar");
  return data;
}

export type DatosCondiciones = { canal: string; estado: string; etiquetas: string[]; texto: string;
  fueraHorario: boolean; contactoNuevo: boolean };

export function cumpleCondiciones(condiciones: CondicionRegla[], datos: DatosCondiciones) {
  return condiciones.every((c) => {
    switch (c.tipo) {
      case "canal": return datos.canal === c.valor;
      case "estado": return datos.estado === c.valor;
      case "etiqueta": return datos.etiquetas.includes(c.valor);
      case "texto_contiene": return datos.texto.toLocaleLowerCase("es-MX").includes(c.valor.toLocaleLowerCase("es-MX"));
      case "texto_no_contiene": return !datos.texto.toLocaleLowerCase("es-MX").includes(c.valor.toLocaleLowerCase("es-MX"));
      case "fuera_horario": return datos.fueraHorario === c.valor;
      case "contacto_nuevo": return datos.contactoNuevo === c.valor;
    }
  });
}
