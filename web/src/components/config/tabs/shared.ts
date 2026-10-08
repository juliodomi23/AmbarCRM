import { toast } from "@/components/Toaster";

export const PUESTOS = [
  "Administrador", "Agente", "Recepcionista", "Doctor", "Coordinador clínico",
  "Especialista", "Vendedor", "Asesor inmobiliario", "Asesor automotriz",
  "Vendedor de tienda", "Abogado", "Pasante", "Asistente jurídico",
  "Coordinador jurídico", "Agente de viajes", "Coordinador de tours", "Guía",
  "Profesor", "Coordinador académico", "Cajero", "Encargado de inventario",
] as const;

export async function api(url: string, metodo: string, body?: unknown) {
  const res = await fetch(url, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    toast(d.error ?? "Ocurrió un error", "error");
    return false;
  }
  return true;
}

export function slugificar(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}
