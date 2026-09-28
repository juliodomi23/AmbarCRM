import { NextRequest, NextResponse } from "next/server";
import { db, runWithOrg } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { getProvider } from "@/lib/channel";
import { aplicarVariables } from "@/lib/plantillas";

export const dynamic = "force-dynamic";

const LIMITE_DIARIO = 50;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const delayAleatorio = () => sleep(1200 + Math.random() * 1800); // 1.2–3 s

/**
 * Envía una plantilla a contactos de una etiqueta (difusión).
 * Límite: 50 mensajes por día para reducir riesgo de baneo.
 * Throttle aleatorio entre mensajes (1.2–3 s).
 * El envío corre en SEGUNDO PLANO: la respuesta es inmediata (encolados) y la UI
 * consulta el GET para ver el avance. Así el proxy no corta el request a medias.
 */
export async function GET(_req: NextRequest) {
  const s = await requireSesion();
  if ("error" in s) return s.error;

  if (_req.nextUrl.searchParams.get("plantillas") === "oficiales") {
    const canalId = _req.nextUrl.searchParams.get("canalId");
    const canal = canalId
      ? await db.canalWhatsapp.findFirst({ where: { id: BigInt(canalId), activo: true } })
      : await db.canalWhatsapp.findFirst({ where: { activo: true }, orderBy: { id: "asc" } });
    const provider = getProvider(canal?.proveedor ?? "evolution", canal?.config, canal?.instancia);
    if (!provider.listarPlantillas) return NextResponse.json({ plantillas: [], disponible: false });
    return NextResponse.json({ plantillas: await provider.listarPlantillas(), disponible: true });
  }

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

  const { etiquetaId, plantillaId, texto, ycloudTemplate, ycloudVariables, canalId } = await req.json().catch(() => ({}));
  if (!etiquetaId) return NextResponse.json({ error: "falta etiquetaId" }, { status: 400 });

  const esPlantillaOficial = !!ycloudTemplate?.name;
  let contenido = (texto ?? "").toString();
  if (plantillaId) {
    const p = await db.plantillaMensaje.findUnique({ where: { id: BigInt(plantillaId) } });
    if (p) contenido = p.contenido;
  }
  if (!contenido.trim() && !esPlantillaOficial) return NextResponse.json({ error: "falta el mensaje" }, { status: 400 });

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

  const canal = canalId
    ? await db.canalWhatsapp.findFirst({ where: { id: BigInt(canalId), activo: true } })
    : await db.canalWhatsapp.findFirst({ where: { activo: true }, orderBy: { id: "asc" } });
  const provider = getProvider(canal?.proveedor ?? "evolution", canal?.config, canal?.instancia);
  if (esPlantillaOficial && (!provider.enviarPlantilla || provider.nombre !== "ycloud")) {
    return NextResponse.json({ error: "Las plantillas oficiales requieren un canal YCloud conectado" }, { status: 400 });
  }

  const contactos = await db.contacto.findMany({
    where: {
      telefono: { not: null },
      optOutDifusion: false,
      etiquetas: { some: { etiquetaId: BigInt(etiquetaId) } }
    },
    take: restantes
  });

  const orgId = s.orgId;
  const userId = s.userId;
  if (orgId == null) return NextResponse.json({ error: "sesión sin organización" }, { status: 500 });

  // Envío detached: al terminar el request se pierde el contexto de sesión, así que
  // el tenant va fijado con runWithOrg (si no, RLS bloquearía los inserts).
  void runWithOrg(orgId, async () => {
    for (const c of contactos) {
      if (!c.telefono) continue;
      try {
        const msg = aplicarVariables(contenido, c);
        const variables = Array.isArray(ycloudVariables)
          ? ycloudVariables.map((value: unknown) => aplicarVariables(String(value), c))
          : [];
        const envio = esPlantillaOficial
          ? await provider.enviarPlantilla!(c.telefono, ycloudTemplate, variables)
          : await provider.enviarTexto(c.telefono, msg);

        const conv = await db.conversacion.upsert({
          where: { contactoId_canalId: { contactoId: c.id, canalId: (canal?.id ?? null) as any } },
          update: { ultimoMensajeAt: new Date() },
          create: { contactoId: c.id, canalId: canal?.id ?? undefined, ultimoMensajeAt: new Date() }
        });
        await db.mensaje.create({
          data: {
            conversacionId: conv.id,
            direccion: "saliente",
            tipo: esPlantillaOficial ? "plantilla" : "texto",
            contenido: esPlantillaOficial ? `[YCloud] ${ycloudTemplate.name}` : msg,
            esDifusion: true,
            status: envio.ok ? "enviado" : "fallido",
            waMessageId: envio.waMessageId,
            enviadoPor: userId
          }
        });
      } catch (e) {
        console.error(`difusión: fallo con contacto ${c.id}:`, e instanceof Error ? e.message : e);
      }
      await delayAleatorio();
    }
  });

  return NextResponse.json({
    ok: true,
    encolados: contactos.length,
    yaEnviadosHoy: yaEnviados,
    restantesHoy: restantes
  });
}
