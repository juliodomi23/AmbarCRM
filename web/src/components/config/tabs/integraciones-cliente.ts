import { toast } from "@/components/Toaster";

export async function peticionIntegracion<T>(url: string, method = "GET", body?: unknown): Promise<T | null> {
  try {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const datos = await res.json();
    if (!res.ok) throw new Error(datos.error ?? "No se pudo completar la operación");
    return datos as T;
  } catch (error) {
    toast(error instanceof Error ? error.message : "No se pudo conectar", "error");
    return null;
  }
}
