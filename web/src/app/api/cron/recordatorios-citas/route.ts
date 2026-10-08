import { NextRequest, NextResponse } from "next/server";
import { db, dbRaw, runWithOrg } from "@/lib/db";
import { requireApiKey } from "@/lib/api-auth";
import { getProvider } from "@/lib/channel";
import {
  horasAnticipacion,
  valoresRecordatorio,
  type VariableRecordatorio,
} from "@/lib/citas";
import { aBigInt } from "@/lib/ids";
import { citasPorRecordar } from "@/lib/recordatorios";
export const dynamic = "force-dynamic";
type Config = {
  anticipacionHoras?: number;
  canalId?: string;
  plantilla?: { name: string; language: string };
  mapeoVariables?: VariableRecordatorio[];
};
type Conteo = { enviados: number; fallidos: number };

async function recordatoriosDeLaEmpresa(conteo: Conteo) {
  const modulo = await db.moduloOrg.findFirst({
    where: { clave: "citas", activo: true },
  });
  const config = modulo?.config as Config | undefined;
  if (!config?.plantilla?.name) return;
  const ajustes = await db.ajustes.findFirst();
  const canalId = config.canalId ? aBigInt(String(config.canalId)) : null;
  const canalFijo = canalId
    ? await db.canalWhatsapp.findFirst({ where: { id: canalId, activo: true } })
    : null;
  const citas = await citasPorRecordar(horasAnticipacion(config.anticipacionHoras));
  for (const cita of citas) {
    if (!cita.contacto.telefono) continue;
    // Reclamar la cita antes de enviar: dos ejecuciones simultáneas no duplican el recordatorio.
    const reclamada = await db.cita.updateMany({
      where: { id: cita.id, recordatorioEnviadoAt: null },
      data: { recordatorioEnviadoAt: new Date() },
    });
    if (reclamada.count === 0) continue;
    const conv =
      cita.conversacion ??
      (await db.conversacion.findFirst({
        where: { contactoId: cita.contactoId },
        include: { canal: true },
        orderBy: { ultimoMensajeAt: "desc" },
      }));
    const canal = canalId ? canalFijo : conv?.canal;
    if (!conv || !canal) {
      conteo.fallidos++;
      continue;
    }
    const provider = getProvider("cloud_api", canal.config, canal.instancia);
    const envio = await (provider.enviarPlantilla?.(
      cita.contacto.telefono,
      config.plantilla,
      valoresRecordatorio(config.mapeoVariables ?? [], {
        nombreContacto: cita.contacto.nombre,
        inicio: cita.inicio,
        titulo: cita.titulo,
        nombreNegocio: ajustes?.marcaNombre ?? ajustes?.nombreNegocio ?? "",
      }),
    ) ?? Promise.resolve({ ok: false as const, error: "proveedor no soporta plantillas" })
    ).catch((error: unknown) => ({ ok: false as const, error: String(error) }));
    await db.mensaje.create({
      data: {
        conversacionId: conv.id,
        direccion: "saliente",
        tipo: "plantilla",
        contenido: `Recordatorio: ${cita.titulo}`,
        status: envio.ok ? "enviado" : "fallido",
        waMessageId: envio.ok ? envio.waMessageId : undefined,
        errorDetalle: envio.ok
          ? null
          : ((envio as { error?: string }).error ?? "No se pudo enviar la plantilla"),
      },
    });
    if (envio.ok) conteo.enviados++;
    else conteo.fallidos++;
  }
}

export async function POST(req: NextRequest) {
  const noAuth = requireApiKey(req);
  if (noAuth) return noAuth;
  const orgs = await dbRaw.$queryRawUnsafe<{ id: bigint }[]>(
    "SELECT id FROM orgs WHERE activo = true",
  );
  const conteo: Conteo = { enviados: 0, fallidos: 0 };
  const empresasConError: string[] = [];
  for (const org of orgs) {
    try {
      await runWithOrg(org.id, () => recordatoriosDeLaEmpresa(conteo));
    } catch (error) {
      // Un error en una empresa no detiene los recordatorios de las demás.
      empresasConError.push(String(org.id));
      console.error(`[cron/recordatorios-citas] org ${org.id}:`, error);
    }
  }
  return NextResponse.json({ ok: true, ...conteo, empresasConError });
}
