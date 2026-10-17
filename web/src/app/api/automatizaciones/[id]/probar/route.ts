import { db } from "@/lib/db";
import { conAdminIntegracion, idIntegracion, respuestaIntegracion } from "@/lib/integraciones-api";
import { validarAcciones, validarCondiciones, cumpleCondiciones } from "@/lib/automatizaciones-esquema";
export const dynamic = "force-dynamic";
export const POST = conAdminIntegracion(async (_req, _orgId, props: { params: Promise<{ id: string }> }) => {
  const regla = await db.reglaAutomatizacion.findUnique({ where: { id: idIntegracion((await props.params).id) } });
  if (!regla) return respuestaIntegracion({ error: "registro inexistente" }, 404);
  const contexto = { canal: "cloud_api", estado: "abierta", etiquetas: [] as string[],
    texto: "Hola, quiero información sobre una cita y precios", fueraHorario: false, contactoNuevo: true };
  const cumple = cumpleCondiciones(validarCondiciones(regla.condiciones), contexto);
  return respuestaIntegracion({ simulacion: true, contexto, cumple,
    acciones: cumple ? validarAcciones(regla.acciones) : [], aviso: "Simulación: no se modificaron datos ni se enviaron mensajes o webhooks" });
});
