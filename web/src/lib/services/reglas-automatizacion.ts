import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ErrorRetail, transaccionTenant } from "@/lib/retail-db";
import { validarRegla, type AccionRegla, type CondicionRegla } from "@/lib/automatizaciones-esquema";
import { puestoPuedeAtenderConversaciones } from "@/lib/modulos-catalogo";

async function validarReferencias(tx: Prisma.TransactionClient, condiciones: CondicionRegla[], acciones: AccionRegla[]) {
  for (const c of condiciones) if (c.tipo === "etiqueta" && !await tx.etiqueta.findUnique({ where: { id: BigInt(c.valor) } })) throw new ErrorRetail("etiqueta inexistente");
  for (const a of acciones) {
    if (a.tipo === "cambiar_estado") continue;
    const id = BigInt(a.id);
    if (a.tipo === "asignar_agente") {
      const agente = await tx.usuario.findFirst({ where: { id, activo: true } });
      if (!agente || !puestoPuedeAtenderConversaciones(agente.puesto, agente.rol)) throw new ErrorRetail("agente inexistente o no puede atender conversaciones");
    }
    if (a.tipo === "agregar_etiqueta" && !await tx.etiqueta.findUnique({ where: { id } })) throw new ErrorRetail("etiqueta inexistente");
    if (a.tipo === "enviar_plantilla" && !await tx.plantillaMensaje.findUnique({ where: { id } })) throw new ErrorRetail("respuesta rápida inexistente");
    if (a.tipo === "enviar_webhook" && !await tx.webhookSaliente.findUnique({ where: { id } })) throw new ErrorRetail("webhook inexistente");
  }
}

export async function guardarRegla(orgId: bigint, body: unknown, id?: bigint) {
  const data = validarRegla(body, id !== undefined);
  return transaccionTenant(orgId, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'alta-reglas:' + orgId}, 0))`;
    const anterior = id ? await tx.reglaAutomatizacion.findUniqueOrThrow({ where: { id } }) : null;
    if (!id && await tx.reglaAutomatizacion.count() >= 25) throw new ErrorRetail("máximo 25 reglas por empresa", 409);
    const completa = validarRegla({ ...(anterior ? { nombre: anterior.nombre, evento: anterior.evento,
      condiciones: anterior.condiciones, acciones: anterior.acciones, activo: anterior.activo } : {}), ...data });
    await validarReferencias(tx, completa.condiciones!, completa.acciones!);
    if (id) return tx.reglaAutomatizacion.update({ where: { id }, data: completa });
    return tx.reglaAutomatizacion.create({ data: { nombre: completa.nombre!, evento: completa.evento!,
      condiciones: completa.condiciones!, acciones: completa.acciones!, activo: completa.activo } });
  });
}

export async function listarReglasConOpciones() {
  const [reglas, agentes, etiquetas, plantillas, webhooks] = await Promise.all([
    db.reglaAutomatizacion.findMany({ orderBy: { id: "asc" }, take: 25 }),
    db.usuario.findMany({ where: { activo: true }, select: { id: true, nombre: true, puesto: true, rol: true } }),
    db.etiqueta.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
    db.plantillaMensaje.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: "asc" } }),
    db.webhookSaliente.findMany({ select: { id: true, url: true }, orderBy: { id: "asc" } }),
  ]);
  return { reglas, opciones: { agentes: agentes.filter((a) => puestoPuedeAtenderConversaciones(a.puesto, a.rol)).map(({ id, nombre }) => ({ id, nombre })),
    etiquetas, plantillas, webhooks: webhooks.map((w) => ({ id: w.id, nombre: w.url })) } };
}
