import { NextRequest, NextResponse } from "next/server";
import { db, dbRaw, runWithOrg } from "@/lib/db";
import { requireApiKey } from "@/lib/api-auth";
import { getProvider } from "@/lib/channel";
import {
  recordatorioDebeEnviarse,
  valoresRecordatorio,
  type VariableRecordatorio,
} from "@/lib/citas";
export const dynamic = "force-dynamic";
type Config = {
  anticipacionHoras?: number;
  canalId?: string;
  plantilla?: { name: string; language: string };
  mapeoVariables?: VariableRecordatorio[];
};
export async function POST(req: NextRequest) {
  const noAuth = requireApiKey(req);
  if (noAuth) return noAuth;
  const orgs = await dbRaw.$queryRawUnsafe<{ id: bigint }[]>(
    "SELECT id FROM orgs WHERE activo = true",
  );
  let enviados = 0,
    fallidos = 0;
  for (const org of orgs)
    await runWithOrg(org.id, async () => {
      const modulo = await db.moduloOrg.findFirst({
        where: { clave: "citas", activo: true },
      });
      const config = modulo?.config as Config | undefined;
      if (!config?.plantilla?.name) return;
      const ajustes = await db.ajustes.findFirst();
      const citas = await db.cita.findMany({
        where: {
          recordatorioEnviadoAt: null,
          estado: { in: ["programada", "confirmada"] },
        },
        include: { contacto: true, conversacion: { include: { canal: true } } },
        take: 100,
      });
      for (const cita of citas) {
        if (
          !recordatorioDebeEnviarse(
            cita.inicio,
            Math.max(1, Number(config.anticipacionHoras) || 24),
          ) ||
          !cita.contacto.telefono
        )
          continue;
        const conv =
          cita.conversacion ??
          (await db.conversacion.findFirst({
            where: { contactoId: cita.contactoId },
            include: { canal: true },
            orderBy: { ultimoMensajeAt: "desc" },
          }));
        const canal = config.canalId
          ? await db.canalWhatsapp.findFirst({
              where: { id: BigInt(config.canalId), activo: true },
            })
          : conv?.canal;
        if (!conv || !canal) {
          fallidos++;
          continue;
        }
        const provider = getProvider(
          "cloud_api",
          canal.config,
          canal.instancia,
        );
        const envio = (await provider.enviarPlantilla?.(
          cita.contacto.telefono,
          config.plantilla,
          valoresRecordatorio(config.mapeoVariables ?? [], {
            nombreContacto: cita.contacto.nombre,
            inicio: cita.inicio,
            titulo: cita.titulo,
            nombreNegocio: ajustes?.marcaNombre ?? ajustes?.nombreNegocio ?? "",
          }),
        )) ?? { ok: false, error: "proveedor no soporta plantillas" };
        await db.mensaje.create({
          data: {
            conversacionId: conv.id,
            direccion: "saliente",
            tipo: "plantilla",
            contenido: `Recordatorio: ${cita.titulo}`,
            status: envio.ok ? "enviado" : "fallido",
            waMessageId: envio.waMessageId,
            errorDetalle: envio.ok
              ? null
              : ((envio as any).error ?? "No se pudo enviar la plantilla"),
          },
        });
        await db.cita.update({
          where: { id: cita.id },
          data: { recordatorioEnviadoAt: new Date() },
        });
        envio.ok ? enviados++ : fallidos++;
      }
    });
  return NextResponse.json({ ok: true, enviados, fallidos });
}
