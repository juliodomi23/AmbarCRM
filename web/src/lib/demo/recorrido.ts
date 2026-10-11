// Pasos del recorrido guiado: cada uno lleva a una pantalla real de la demo.
import type { Datos } from "./tipos";

export type PasoRecorrido = { ruta: string; titulo: string; descripcion: string; requiere?: string };

/** Pantalla principal del giro (primer módulo activo con pantalla propia en la demo). */
export function rutaModuloGiro(d: Datos): { ruta: string; nombre: string } | null {
  const orden: Array<[string, string, string]> = [
    ["citas", "/citas", "Citas"],
    ["caja", "/caja", "Caja"],
    ["productos", "/productos", "Productos"],
    ["cotizaciones", "/cotizaciones", "Cotizaciones"],
    ["pedidos_en_linea", "/pedidos-en-linea", "Pedidos en línea"],
  ];
  const hallado = orden.find(([clave]) => d.modulos[clave]?.activo);
  return hallado ? { ruta: hallado[1], nombre: hallado[2] } : null;
}

export function pasosRecorrido(d: Datos): PasoRecorrido[] {
  const modulo = rutaModuloGiro(d);
  return [
    { ruta: "/", titulo: "Pulso del negocio", descripcion: "Métricas operativas, ventas, respuesta, satisfacción y actividad en un vistazo." },
    { ruta: "/chat", titulo: "Bandeja compartida", descripcion: "Asignación, notas, etiquetas, ventana de 24 horas, plantillas y sugerencias con IA. Prueba enviar un mensaje." },
    { ruta: "/embudos", titulo: "Seguimiento comercial", descripcion: "Cada conversación puede convertirse en una oportunidad con responsable, valor y siguiente paso. Arrastra una tarjeta." },
    { ruta: "/contactos", titulo: "Una sola ficha", descripcion: "Teléfono, conversaciones, oportunidades, etiquetas y campos propios sin duplicar al cliente." },
    { ruta: "/tareas", titulo: "Nadie olvida un seguimiento", descripcion: "Tareas con vencimiento y responsable; crea, completa o borra una." },
    ...(modulo ? [{ ruta: modulo.ruta, titulo: `${modulo.nombre}: un CRM para tu giro`, descripcion: "Los módulos se encienden por empresa: aquí ves el del giro elegido en la barra superior." }] : []),
    { ruta: "/configuracion", titulo: "Control y seguridad", descripcion: "Marca, módulos, usuarios, puestos, embudos, plantillas y bots. Cambia el nombre o el color y mira el menú." },
  ];
}
