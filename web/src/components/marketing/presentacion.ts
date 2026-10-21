import type { EstadoCampana, TipoCampana } from "@/lib/marketing";

export const ESTADOS_UI: Record<EstadoCampana, { nombre: string; ayuda: string; tono: "neutral" | "warning" | "success" | "info" }> = {
  borrador: { nombre: "Borrador", ayuda: "Completa tu idea a tu ritmo", tono: "neutral" },
  en_revision: { nombre: "Por revisar", ayuda: "Espera aprobación de un administrador", tono: "warning" },
  aprobada: { nombre: "Aprobada internamente", ayuda: "Plan aprobado por tu equipo", tono: "success" },
  archivada: { nombre: "Archivada", ayuda: "Guardada como referencia", tono: "neutral" },
};

export const OBJETIVOS_UI = {
  mensajes: { nombre: "Recibir mensajes", ayuda: "Que más personas inicien una conversación." },
  clientes_potenciales: { nombre: "Conseguir interesados", ayuda: "Encontrar personas que quieren saber más." },
  ventas: { nombre: "Impulsar ventas", ayuda: "Dar a conocer un producto o una oferta." },
  reconocimiento: { nombre: "Dar a conocer mi negocio", ayuda: "Llegar a más personas y presentar tu marca." },
};

export const CANALES_UI: Record<string, string> = {
  whatsapp: "WhatsApp", instagram: "Instagram", facebook: "Facebook", otro: "Otro canal", facebook_instagram: "Facebook e Instagram",
};

export function endpointCampanas(tipo: TipoCampana) {
  return `/api/${tipo === "meta_ads" ? "meta-ads" : "marketing"}/campanas`;
}

export function fechaCampana(fecha: string | null) {
  if (!fecha) return "Por definir";
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${fecha}T12:00:00Z`));
}

export function presupuestoCampana(valor: string | null) {
  return valor === null ? "Por definir" : new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 }).format(Number(valor));
}

export async function respuestaCampana<T>(respuesta: Response): Promise<T> {
  const datos = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    throw new Error(datos?.error ?? (respuesta.status === 401 ? "Tu sesión terminó. Vuelve a iniciar sesión." : "No pudimos completar la operación. Intenta de nuevo."));
  }
  if (!datos) throw new Error("No recibimos una respuesta válida. Intenta de nuevo.");
  return datos as T;
}
