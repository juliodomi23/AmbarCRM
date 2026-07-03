import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { getProvider } from "@/lib/channel";
import { aplicarVariables } from "@/lib/plantillas";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const LIMITE_DIARIO = 50;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const delayAleatorio = () => sleep(1200 + Math.random() * 1800); // 1.2–3 s

/**
 * Envía una plantilla a contactos de una etiqueta (difusión).
 * Límite: 50 mensajes por día para reducir riesgo de baneo.
 * Throttle aleatorio entre mensajes (1.2–3 s).
 */
export async function GET(_req: NextRequest) {
  const s = await requireSesion();
  if ("error" in s) return s.error;

  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  const yaEnviados = await db.mensaje.count({
    where: { esDifusion: true, createdAt: { gte: inicio } }
  });

  return NextResponse.json({ yaEnviados, restantes: Math.max(0, LIMITE_DIARIO - yaEnviados), limiteDiario: LIMITE_DIARIO });
}

export async function POST(req: NextRequest) {
  const s = await requireSesion(true);
  if ("error" in s) return s.error;

  const { etiquetaId, plantillaId, texto } = await req.json().catch(() => ({}));
  if (!etiquetaId) return NextResponse.json({ error: "falta etiquetaId" }, { status: 400 });

  let contenido = (texto ?? "").toString();
  if (plantillaId) {
    const p = await db.plantillaMensaje.findUnique({ where: { id: BigInt(plantillaId) } });
    if (p) contenido = p.contenido;
  }
  if (!contenido.trim()) return NextResponse.json({ error: "falta el mensaje" }, { status: 400 });

  // Verificar cuántos difusión se enviaron hoy
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  const yaEnviados = await db.mensaje.count({
    where: { esDifusion: true, createdAt: { gte: inicio } }
  });
  const restantes = Math.max(0, LIMITE_DIARIO - yaEnviados);

  if (restantes === 0) {
    return NextResponse.json(
      { error: `Límite diario alcanzado (${LIMITE_DIARIO} mensajes). Vuelve mañana para proteger el número de baneo.` },
      { status: 429 }
    );
  }

  const canal = await db.canalWhatsapp.findFirst({ where: { activo: true } });
  const provider = getProvider(canal?.proveedor ?? "evolution", canal?.config, canal?.instancia);

  const contactos = await db.contacto.findMany({
    where: {
      telefono: { not: null },
      optOutDifusion: false,
      etiquetas: { some: { etiquetaId: BigInt(etiquetaId) } }
    },
    take: restantes
  });

  let enviados = 0;
  let fallidos = 0;

  for (const c of contactos) {
    if (!c.telefono) continue;
    const msg = aplicarVariables(contenido, c);
    const envio = await provider.enviarTexto(c.telefono, msg);

    const conv = await db.conversacion.upsert({
      where: { contactoId_canalId: { contactoId: c.id, canalId: (canal?.id ?? null) as any } },
      update: { ultimoMensajeAt: new Date() },
      create: { contactoId: c.id, canalId: canal?.id ?? undefined, ultimoMensajeAt: new Date() }
    });
    await db.mensaje.create({
      data: {
        conversacionId: conv.id,
        direccion: "saliente",
        tipo: "texto",
        contenido: msg,
        esDifusion: true,
        status: envio.ok ? "enviado" : "fallido",
        waMessageId: envio.waMessageId,
        enviadoPor: s.userId
      }
    });

    envio.ok ? enviados++ : fallidos++;
    await delayAleatorio();
  }

  const nuevosYaEnviados = yaEnviados + enviados;
  return NextResponse.json({
    ok: true,
    total: contactos.length,
    enviados,
    fallidos,
    yaEnviadosHoy: nuevosYaEnviados,
    restantesHoy: Math.max(0, LIMITE_DIARIO - nuevosYaEnviados)
  });
}
