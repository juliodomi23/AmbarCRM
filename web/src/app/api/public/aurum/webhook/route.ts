import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db, dbRaw, runWithOrg } from "@/lib/db";
import { clientesAurum, conexionDe, moduloLealtad } from "@/lib/aurum";
import { getProvider } from "@/lib/channel";
import {
  buscarCliente,
  diezDigitos,
  formaDeAviso,
  slugValido,
  textoPremio,
  type PlantillaPremio,
} from "@/lib/lealtad";
import { estadoVentana } from "@/lib/meta/ventana";

export const dynamic = "force-dynamic";

/** Compara hashes (misma longitud siempre) para que el tiempo no dependa del largo ni del contenido. */
function secretoValido(recibido: string | null) {
  const esperado = process.env.AURUM_WEBHOOK_SECRET ?? "";
  if (!esperado || !recibido) return false;
  const hash = (valor: string) => createHash("sha256").update(valor).digest();
  return timingSafeEqual(hash(recibido), hash(esperado));
}

/**
 * Aurum avisa cuando un cliente gana premio. El secreto va preferentemente en el header
 * `x-aurum-clave` (la URL queda en los logs de proxies); se sigue aceptando `?clave=` para no
 * romper integraciones ya configuradas.
 */
export async function POST(req: NextRequest) {
  const clave = req.headers.get("x-aurum-clave") ?? req.nextUrl.searchParams.get("clave");
  if (!secretoValido(clave)) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const slug = slugValido(body.slug);
  if (body.event !== "reward_earned" || !slug || !diezDigitos(body.phone)) {
    return NextResponse.json({ ok: true, ignorado: "evento no soportado" });
  }
  const [destino] = await dbRaw.$queryRaw<{ org_id: bigint | null }[]>`
    SELECT resolve_org_by_aurum_slug(${slug}) AS org_id`;
  if (!destino?.org_id) return NextResponse.json({ ok: true, ignorado: "negocio sin conectar" });

  const resultado = await runWithOrg(destino.org_id, () => avisarPremio(body));
  return NextResponse.json({ ok: true, ...resultado });
}

async function avisarPremio(body: { phone: string; name?: string; earned?: unknown }) {
  const modulo = await moduloLealtad();
  const conexion = conexionDe(modulo?.config);
  if (!conexion || conexion.estado === "error") return { ignorado: "conexión inactiva" };

  // No se confía en el cuerpo del webhook: se confirma con Aurum que el premio existe.
  const cliente = buscarCliente(await clientesAurum(conexion, { fresco: true }), body.phone);
  if (!cliente || cliente.pending_rewards <= 0) return { ignorado: "sin premio pendiente en Aurum" };

  const ultimos10 = diezDigitos(cliente.phone)!;
  const contacto = await db.contacto.findFirst({ where: { telefono: { endsWith: ultimos10 } } });
  const conv = contacto
    ? await db.conversacion.findFirst({
        where: { contactoId: contacto.id, canal: { activo: true } },
        include: { canal: true },
        orderBy: { ultimoMensajeAt: "desc" },
      })
    : null;
  if (!contacto?.telefono || !conv?.canal) return { ignorado: "contacto sin conversación de WhatsApp" };

  const premios = Array.isArray(body.earned) ? body.earned.map(String).slice(0, 5) : [];
  const premioTexto = premios.length ? premios : ["un premio"];
  const ultimoEntrante = await db.mensaje.findFirst({
    where: { conversacionId: conv.id, direccion: "entrante" },
    orderBy: { timestamp: "desc" },
    select: { timestamp: true },
  });
  const plantilla = (modulo!.config as { plantillaPremio?: PlantillaPremio }).plantillaPremio;
  const forma = formaDeAviso(plantilla, estadoVentana(ultimoEntrante?.timestamp).abierta);

  await db.mensaje.create({
    data: {
      conversacionId: conv.id,
      direccion: "saliente",
      tipo: "texto",
      interna: true,
      status: "enviado",
      contenido: `🎁 Lealtad: ${cliente.name} ganó ${premioTexto.join(", ")}.${forma === "nota" ? " No se le avisó por WhatsApp: la ventana de 24 h está cerrada y no hay plantilla configurada." : ""}`,
    },
  });
  if (forma === "nota") return { avisado: false };

  const provider = getProvider("cloud_api", conv.canal.config, conv.canal.instancia);
  const texto = textoPremio(cliente.name, premioTexto);
  const envio = forma === "plantilla" && provider.enviarPlantilla
    ? await provider.enviarPlantilla(contacto.telefono, plantilla!, [cliente.name, premioTexto.join(", ")])
    : await provider.enviarTexto(contacto.telefono, texto);
  await db.mensaje.create({
    data: {
      conversacionId: conv.id,
      direccion: "saliente",
      tipo: forma === "plantilla" ? "plantilla" : "texto",
      contenido: forma === "plantilla" ? `[Plantilla ${plantilla!.name}] ${texto}` : texto,
      status: envio.ok ? "enviado" : "fallido",
      waMessageId: envio.waMessageId,
      errorDetalle: envio.ok ? null : (envio.error ?? "No se pudo enviar"),
    },
  });
  return { avisado: envio.ok, forma };
}
