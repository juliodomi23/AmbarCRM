import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { getProvider } from "@/lib/channel";
import { instanciaPorDefecto } from "@/lib/channel/evolution";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Importa los grupos del número (y sus últimos mensajes). Usa el primer canal activo. */
export async function POST(_req: NextRequest) {
  const s = await requireSesion(true);
  if ("error" in s) return s.error;

  const canal = await db.canalWhatsapp.findFirst({ where: { activo: true } });
  const provider = getProvider(canal?.proveedor ?? "evolution");
  if (!provider.listarGruposWA) {
    return NextResponse.json({ error: "este proveedor no permite importar grupos" }, { status: 400 });
  }

  const instancia = canal?.instancia?.trim() || instanciaPorDefecto;
  const grupos = await provider.listarGruposWA(instancia);

  let gruposNuevos = 0;
  for (const g of grupos) {
    if (!g.jid) continue;
    const existe = await db.grupo.findFirst({ where: { jid: g.jid } });
    const grupo = existe
      ? await db.grupo.update({ where: { id: existe.id }, data: { nombre: g.nombre } })
      : await db.grupo.create({ data: { jid: g.jid, nombre: g.nombre, canalId: canal?.id ?? undefined } });
    if (existe) continue;
    gruposNuevos++;

    const hist = provider.obtenerMensajes ? await provider.obtenerMensajes(instancia, g.jid, 5) : [];
    for (const h of hist) {
      await db.mensajeGrupo.upsert({
        where: { waMessageId: h.waMessageId },
        update: {},
        create: {
          grupoId: grupo.id,
          direccion: h.direccion,
          tipo: h.tipo,
          contenido: h.contenido ?? (h.tipo !== "texto" ? `[${h.tipo}]` : null),
          mediaMime: h.mediaMime ?? null,
          remitente: h.remitenteNombre ?? h.remitenteTel ?? null,
          remitenteTel: h.remitenteTel ?? null,
          status: h.direccion === "entrante" ? "entregado" : "enviado",
          waMessageId: h.waMessageId,
          timestamp: h.timestamp
        }
      });
    }
    const ult = hist[hist.length - 1];
    if (ult) await db.grupo.update({ where: { id: grupo.id }, data: { ultimoMensajeAt: ult.timestamp } });
  }

  return NextResponse.json({ ok: true, grupos: grupos.length, gruposNuevos });
}
