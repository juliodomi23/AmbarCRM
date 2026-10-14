import { Prisma } from "@prisma/client";

export function valorContrato(contrato) {
  const anual = contrato.montoCierre == null && contrato.mensualidad != null;
  return { valor: new Prisma.Decimal(contrato.montoCierre ?? contrato.mensualidad ?? 0).mul(anual ? 12 : 1), anual };
}

/** @param {bigint|null} [contactoId] */
export async function actualizarEmbudoAR(tx, contactoId = null) {
  const embudo = await tx.embudo.findFirst({ where: { nombre: "Comercial Ámbar Rojo" } });
  if (!embudo) throw new Error("Falta el embudo Comercial Ámbar Rojo; ejecutar el seed primero");
  const etapas = await tx.etapa.findMany({ where: { embudoId: embudo.id, tipo: { in: ["ganado", "perdido"] } } });
  const ganado = etapas.find(e => e.tipo === "ganado");
  const perdido = etapas.find(e => e.tipo === "perdido");
  if (!ganado || !perdido) throw new Error("Faltan etapas Ganado/Perdido");
  if (contactoId) await tx.$queryRaw`SELECT id FROM contactos WHERE id=${contactoId} FOR NO KEY UPDATE`;
  const contactos = await tx.contacto.findMany({ where: { ...(contactoId ? { id: contactoId } : {}), contratos: { some: {} }, nombre: { not: "Coparmex" } }, include: { contratos: true } });
  let creadas = 0, actualizadas = 0;
  for (const contacto of contactos) {
    if (!contactoId) await tx.$queryRaw`SELECT id FROM contactos WHERE id=${contacto.id} FOR NO KEY UPDATE`;
    contacto.contratos = await tx.contrato.findMany({ where: { contactoId: contacto.id } });
    const vigentes = contacto.contratos.filter(c => !["baja", "incobrable"].includes(c.estado));
    const contratos = vigentes.length ? vigentes : contacto.contratos;
    const importes = contratos.map(valorContrato);
    const valor = importes.reduce((s, c) => s.plus(c.valor), new Prisma.Decimal(0));
    const titulo = `Servicio contratado · ${contacto.nombre}`;
    const estado = vigentes.length ? "ganado" : "perdido";
    const motivoPerdida = estado === "perdido" ? contratos.map(c => c.estado === "incobrable" ? "Cierre incobrable" : `Baja${c.fechaBaja ? ` ${c.fechaBaja.toISOString().slice(0,10)}` : " (fecha por confirmar)"}`).join("; ") : null;
    const camposAR = { valorAnual: importes.some(c => c.anual), criterioValor: importes.some(c => c.anual) ? "Incluye valor anual: mensualidad × 12 cuando no existe monto de cierre" : "Suma de montos de cierre conocidos" };
    const actual = await tx.oportunidad.findFirst({ where: { contactoId: contacto.id, embudoId: embudo.id, titulo } });
    const datos = { valor, estado, motivoPerdida, etapaId: (estado === "ganado" ? ganado : perdido).id };
    if (!actual) {
      await tx.oportunidad.create({ data: { ...datos, contactoId: contacto.id, embudoId: embudo.id, titulo, campos: camposAR } });
      creadas++;
    } else if (!actual.valor.eq(valor) || actual.estado !== estado || actual.etapaId !== datos.etapaId || actual.motivoPerdida !== motivoPerdida || JSON.stringify(actual.campos) !== JSON.stringify({ ...actual.campos, ...camposAR })) {
      await tx.oportunidad.update({ where: { id: actual.id }, data: { ...datos, campos: { ...actual.campos, ...camposAR } } });
      actualizadas++;
    }
    const oportunidad = actual ?? await tx.oportunidad.findFirstOrThrow({ where: { contactoId: contacto.id, embudoId: embudo.id, titulo } });
    if (camposAR.valorAnual && !(await tx.nota.findFirst({ where: { oportunidadId: oportunidad.id, contenido: camposAR.criterioValor } }))) {
      await tx.nota.create({ data: { oportunidadId: oportunidad.id, contenido: camposAR.criterioValor } });
    }
    if (!contactoId) await tx.contrato.updateMany({ where: { contactoId: contacto.id, oportunidadId: null }, data: { oportunidadId: oportunidad.id } });
  }
  return { clientes: contactos.length, creadas, actualizadas };
}
