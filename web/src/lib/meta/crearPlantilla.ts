import { META_GRAPH_URL } from "@/lib/meta/config";
import { tokenFromChannelConfig } from "@/lib/meta/credentials";
import { componenteBotones, errorDeBotones, errorDePlantilla, leerBotones, variablesDePlantilla } from "@/lib/meta/plantillaMeta";

export async function crearPlantillaMeta(configuracion: unknown, entrada: Record<string, unknown>) {
  const name = String(entrada.name || "").trim().toLowerCase();
  const language = String(entrada.language || "es_MX").trim();
  const category = String(entrada.category || "UTILITY").trim().toUpperCase();
  const text = String(entrada.body || "").trim();
  if (!/^[a-z0-9_]{1,512}$/.test(name)) return { status: 400, error: "el nombre solo acepta minúsculas, números y guion bajo" };
  if (!text || text.length > 1024) return { status: 400, error: "el mensaje debe tener entre 1 y 1024 caracteres" };
  if (!["UTILITY", "MARKETING"].includes(category)) return { status: 400, error: "categoría inválida" };
  const ejemplos = Array.isArray(entrada.ejemplos) ? entrada.ejemplos.map((ejemplo) => String(ejemplo ?? "").trim()) : [];
  const errorPlantilla = errorDePlantilla(text, ejemplos);
  if (errorPlantilla) return { status: 400, error: errorPlantilla };
  const botones = leerBotones(entrada.botones);
  const errorBotones = errorDeBotones(botones);
  if (errorBotones) return { status: 400, error: errorBotones };
  const totalVariables = variablesDePlantilla(text).length;
  const cuerpo = totalVariables ? { type: "BODY", text, example: { body_text: [ejemplos.slice(0, totalVariables)] } } : { type: "BODY", text };
  const components = [cuerpo, componenteBotones(botones)].filter(Boolean);

  const config = (configuracion || {}) as Record<string, unknown>;
  const wabaId = typeof config.wabaId === "string" ? config.wabaId : "";
  const token = tokenFromChannelConfig(config);
  if (!wabaId || !token) return { status: 400, error: "canal sin credenciales Meta" };

  const response = await fetch(`${META_GRAPH_URL}/${wabaId}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, language, category, components })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { status: 502, error: data?.error?.error_user_msg || data?.error?.message || `Meta HTTP ${response.status}` };
  return { status: 201, plantilla: { name, language, category, status: data.status || "PENDING", id: data.id, components } };
}
