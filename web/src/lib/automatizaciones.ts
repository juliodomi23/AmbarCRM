import { db, runWithOrg } from "@/lib/db";
import { transaccionTenant } from "@/lib/retail-db";
import { DISPARADORES, cumpleCondiciones, validarAcciones, validarCondiciones, type AccionRegla } from "@/lib/automatizaciones-esquema";
import type { ContextoEvento } from "@/lib/disparar-evento";
import type { EventoCrm } from "@/lib/eventos-crm";
import { getAjustes } from "@/lib/services/config";
import { estaFueraDeHorario } from "@/lib/horario";
import { puestoPuedeAtenderConversaciones } from "@/lib/modulos-catalogo";
import { agregarEtiquetaContacto, modificarConversacion } from "@/lib/services/acciones-conversacion";
import { enviarRespuestaRegla } from "@/lib/services/automatizaciones-envio";
import { entregarEvento } from "@/lib/webhooks-salientes";

async function reservarEjecucion(orgId: bigint, reglaId: bigint, conversacionId: bigint) {
  return transaccionTenant(orgId, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'reglas:' + orgId + ':' + conversacionId}, 0))`;
    if (!await tx.conversacion.findUnique({ where: { id: conversacionId }, select: { id: true } })) return null;
    const cuenta = await tx.ejecucionRegla.count({ where: { conversacionId, creadoEn: { gte: new Date(Date.now() - 3600000) } } });
    if (cuenta >= 20) return null;
    return tx.ejecucionRegla.create({ data: { reglaId, conversacionId, resultado: "ok", detalle: "Ejecución reservada" } });
  });
}

async function ejecutarAccion(orgId: bigint, evento: EventoCrm, conversacionId: bigint, accion: AccionRegla) {
  if (accion.tipo === "enviar_plantilla") return enviarRespuestaRegla(orgId, conversacionId, BigInt(accion.id));
  if (accion.tipo === "enviar_webhook") {
    const [entrega] = await entregarEvento(orgId, evento, { id: String(conversacionId), conversacion_id: String(conversacionId) }, {}, BigInt(accion.id));
    return !entrega ? "omitida_destino" : entrega.ok ? "ok" : "error_webhook";
  }
  return transaccionTenant(orgId, async (tx) => {
    const conv = await tx.conversacion.findUnique({ where: { id: conversacionId } });
    if (!conv) return "omitida_destino";
    if (accion.tipo === "agregar_etiqueta") {
      const etiquetaId = BigInt(accion.id);
      if (!await tx.etiqueta.findUnique({ where: { id: etiquetaId }, select: { id: true } })) return "omitida_destino";
      await agregarEtiquetaContacto(tx, conv.contactoId, etiquetaId);
    } else if (accion.tipo === "asignar_agente") {
      const agente = await tx.usuario.findFirst({ where: { id: BigInt(accion.id), activo: true } });
      if (!agente || !puestoPuedeAtenderConversaciones(agente.puesto, agente.rol)) return "omitida_destino";
      await modificarConversacion(tx, conversacionId, { responsableId: agente.id, botActivo: false });
    } else await modificarConversacion(tx, conversacionId, { estado: accion.valor });
    return "ok";
  });
}

export async function ejecutarReglas(orgId: bigint, evento: EventoCrm, contexto: ContextoEvento) {
  if (contexto.origen !== "contacto" && contexto.origen !== "agente") return [];
  if (!(DISPARADORES as readonly string[]).includes(evento)) return [];
  try {
    return await runWithOrg(orgId, async () => {
      const reglas = await db.reglaAutomatizacion.findMany({ where: { activo: true, evento }, orderBy: { id: "asc" }, take: 25 });
      if (!reglas.length) return [];
      const conversacionId = BigInt(contexto.conversacionId);
      const conv = await db.conversacion.findUnique({ where: { id: conversacionId }, include: {
        canal: { select: { proveedor: true } }, contacto: { include: { etiquetas: { select: { etiquetaId: true } } } },
      } });
      if (!conv || conv.contacto.esPersonal) return [];
      const ajustes = await getAjustes();
      const datos = { canal: conv.canal?.proveedor ?? "", estado: conv.estado,
        etiquetas: conv.contacto.etiquetas.map((e) => String(e.etiquetaId)), texto: contexto.texto ?? "",
        fueraHorario: ajustes.horarioActivo && estaFueraDeHorario(ajustes), contactoNuevo: contexto.contactoNuevo === true };
      const resultados: { reglaId: string; resultado: string; detalle: string }[] = [];
      for (const regla of reglas) {
        let condiciones, acciones;
        try { condiciones = validarCondiciones(regla.condiciones); acciones = validarAcciones(regla.acciones); }
        catch { continue; }
        if (!cumpleCondiciones(condiciones, datos)) continue;
        const ejecucion = await reservarEjecucion(orgId, regla.id, conversacionId);
        if (!ejecucion) break;
        const estados: string[] = [];
        for (const accion of acciones) {
          try { estados.push(await ejecutarAccion(orgId, evento, conversacionId, accion)); }
          catch { estados.push("error_accion"); }
        }
        const resultado = estados.some((e) => e.startsWith("error")) ? "error" : estados.some((e) => e.startsWith("omitida")) ? "omitida" : "ok";
        const detalle = estados.join(", ");
        await db.ejecucionRegla.update({ where: { id: ejecucion.id }, data: { resultado, detalle } });
        resultados.push({ reglaId: String(regla.id), resultado, detalle });
      }
      await db.ejecucionRegla.deleteMany({ where: { creadoEn: { lt: new Date(Date.now() - 7 * 86400000) } } });
      return resultados;
    });
  } catch { return []; }
}
