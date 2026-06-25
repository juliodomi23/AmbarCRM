import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { getAjustes } from "@/lib/services/config";
import { permitido } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const MODELO = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";

const PROMPT_DEFAULT =
  "Eres un asistente de atención al cliente por WhatsApp. " +
  "A partir de la conversación, redacta la SIGUIENTE respuesta del AGENTE: breve, cordial, " +
  "en español neutro, lista para enviar. Devuelve SOLO el texto del mensaje, sin comillas ni explicaciones.";

/** Sugiere una respuesta para el agente con base en el historial de la conversación. */
export async function POST(req: NextRequest) {
  const s = await requireSesion();
  if ("error" in s) return s.error;

  // Tope de uso de IA: máx 20 sugerencias por usuario cada minuto (protege la cuota de Anthropic = dinero).
  if (!permitido(`ia:${s.userId}`, 20, 60_000)) {
    return NextResponse.json({ error: "Demasiadas sugerencias seguidas, espera un momento." }, { status: 429 });
  }

  if (!API_KEY) {
    return NextResponse.json({ error: "Falta ANTHROPIC_API_KEY en el .env del CRM" }, { status: 400 });
  }

  const { conversacionId } = await req.json().catch(() => ({}));
  if (!conversacionId) return NextResponse.json({ error: "falta conversacionId" }, { status: 400 });

  const [conv, ajustes] = await Promise.all([
    db.conversacion.findUnique({
      where: { id: BigInt(conversacionId) },
      include: {
        contacto: { include: { etiquetas: { include: { etiqueta: true } } } },
        mensajes: { orderBy: { timestamp: "desc" }, take: 12 }
      }
    }),
    getAjustes()
  ]);
  if (!conv) return NextResponse.json({ error: "conversación inexistente" }, { status: 404 });

  const nombreNegocio = ajustes.nombreNegocio?.trim() || null;
  const promptBase = ajustes.iaPromptSistema?.trim() || PROMPT_DEFAULT;

  const etiquetasContacto = conv.contacto.etiquetas.map((ce: any) => ce.etiqueta.nombre).join(", ");

  let sistema = promptBase;
  if (nombreNegocio) sistema = `Trabajas para "${nombreNegocio}". ` + sistema;
  if (etiquetasContacto) sistema += ` El contacto tiene las etiquetas: ${etiquetasContacto}.`;

  const historial = conv.mensajes
    .reverse()
    .filter((m) => !m.interna && m.contenido)
    .map((m) => `${m.direccion === "entrante" ? "Cliente" : "Agente"}: ${m.contenido}`)
    .join("\n");

  if (!historial.trim()) return NextResponse.json({ error: "no hay mensajes para analizar" }, { status: 400 });

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 400,
        system: sistema,
        messages: [{ role: "user", content: `Conversación con ${conv.contacto.nombre}:\n\n${historial}` }]
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: data?.error?.message ?? `HTTP ${res.status}` }, { status: 502 });
    }
    const sugerencia = (data?.content?.[0]?.text ?? "").trim();
    return NextResponse.json({ sugerencia });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "error de red" }, { status: 502 });
  }
}
