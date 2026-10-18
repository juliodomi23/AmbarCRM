import { db } from "@/lib/db";
import { getProvider } from "@/lib/channel";
import { horasAnticipacion, valoresRecordatorio, type VariableRecordatorio } from "@/lib/citas";
import { aBigInt } from "@/lib/ids";
import { citasPorRecordar, filtroRecordatorio } from "@/lib/recordatorios";
import { configReservasEmpresa } from "@/lib/reservas/servidor";

type Config = { anticipacionHoras?: number; canalId?: string; plantilla?: { name: string; language: string }; mapeoVariables?: VariableRecordatorio[] };
export type ConteoRecordatorios = { enviados: number; fallidos: number; omitidos: number; revisados: number };
export const conteoRecordatorios = (): ConteoRecordatorios => ({ enviados: 0, fallidos: 0, omitidos: 0, revisados: 0 });

export async function recordatoriosDeLaEmpresa(conteo: ConteoRecordatorios, proveedor = getProvider, ahora = new Date()) {
  const modulo = await db.moduloOrg.findFirst({ where: { clave: "citas", activo: true } });
  const config = modulo?.config as Config | undefined;
  if (!config?.plantilla?.name) return;
  const [ajustes, cfg] = await Promise.all([db.ajustes.findFirst(), configReservasEmpresa()]);
  const canalId = config.canalId ? aBigInt(String(config.canalId)) : null;
  const canalFijo = canalId ? await db.canalWhatsapp.findFirst({ where: { id: canalId, activo: true, proveedor: "cloud_api" } }) : null;
  const anticipacion = horasAnticipacion(config.anticipacionHoras);
  let despuesId = 0n;
  // Máximo 2000 candidatas por empresa y ejecución; el resto queda para el siguiente cron.
  for (let lote = 0; lote < 20; lote++) {
    const citas = await citasPorRecordar(anticipacion, ahora, despuesId);
    if (!citas.length) break;
    for (const cita of citas) {
      despuesId = cita.id;
      conteo.revisados++;
      if (!cita.contacto.telefono) { conteo.omitidos++; continue; }
      const conv = cita.conversacion ?? await db.conversacion.findFirst({
        where: { contactoId: cita.contactoId, canal: { activo: true, proveedor: "cloud_api" } },
        include: { canal: true }, orderBy: { ultimoMensajeAt: "desc" },
      });
      const canal = canalId ? canalFijo : conv?.canal;
      if (!conv || !canal?.activo || canal.proveedor !== "cloud_api") { conteo.omitidos++; continue; }
      const provider = proveedor("cloud_api", canal.config, canal.instancia);
      if (!provider.enviarPlantilla) { conteo.omitidos++; continue; }
      const marca = new Date();
      const reclamada = await db.cita.updateMany({
        where: { ...filtroRecordatorio(anticipacion, ahora), id: cita.id, inicio: cita.inicio, fin: cita.fin, doctorId: cita.doctorId },
        data: { recordatorioEnviadoAt: marca, recordatorioIntentadoAt: marca, recordatorioIntentos: { increment: 1 } },
      });
      if (!reclamada.count) continue;
      const envio = await provider.enviarPlantilla(cita.contacto.telefono, config.plantilla, valoresRecordatorio(config.mapeoVariables ?? [], {
        nombreContacto: cita.contacto.nombre, inicio: cita.inicio, titulo: cita.titulo,
        nombreNegocio: ajustes?.marcaNombre ?? ajustes?.nombreNegocio ?? "", zona: cfg.zona,
      })).catch((error: unknown) => ({ ok: false as const, error: String(error), waMessageId: undefined }));
      if (envio.ok) conteo.enviados++;
      else {
        conteo.fallidos++;
        await db.cita.updateMany({ where: { id: cita.id, recordatorioEnviadoAt: marca, recordatorioIntentadoAt: marca, inicio: cita.inicio, fin: cita.fin, doctorId: cita.doctorId }, data: { recordatorioEnviadoAt: null } });
      }
      await db.mensaje.create({ data: {
        conversacionId: conv.id, direccion: "saliente", tipo: "plantilla", contenido: `Recordatorio: ${cita.titulo}`,
        status: envio.ok ? "enviado" : "fallido", waMessageId: envio.ok ? envio.waMessageId : undefined,
        errorDetalle: envio.ok ? null : (envio.error ?? "No se pudo enviar la plantilla"),
      } });
    }
    if (citas.length < 100) break;
  }
}
