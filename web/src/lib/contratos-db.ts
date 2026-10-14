import { Prisma } from "@prisma/client";
import { ErrorRetail, transaccionTenant } from "@/lib/retail-db";
import { cargosCierre, validarContrato } from "@/lib/contratos-cobros";

export type DatosContrato = ReturnType<typeof validarContrato>;

async function validarReferencias(tx: Prisma.TransactionClient, datos: DatosContrato) {
  const contacto = await tx.contacto.findFirst({ where: { id: datos.contactoId } });
  if (!contacto) throw new ErrorRetail("Cliente inexistente o de otra empresa", 400);
  if (datos.oportunidadId) {
    const oportunidad = await tx.oportunidad.findFirst({ where: { id: datos.oportunidadId, contactoId: datos.contactoId } });
    if (!oportunidad) throw new ErrorRetail("La oportunidad debe pertenecer al cliente y a esta empresa", 400);
  }
}

export function crearContrato(orgId: bigint, datos: DatosContrato) {
  return transaccionTenant(orgId, async (tx) => {
    await validarReferencias(tx, datos);
    const contrato = await tx.contrato.create({ data: datos });
    const cargos = cargosCierre(datos.montoCierre, datos.anticipoPct);
    if (cargos.length) await tx.cobro.createMany({ data: cargos.map((cargo) => ({ ...cargo, contratoId: contrato.id })) });
    return contrato;
  });
}

export function editarContrato(orgId: bigint, id: bigint, cambios: Record<string, unknown>, esAdmin = true) {
  return transaccionTenant(orgId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM contratos WHERE id = ${id} FOR UPDATE`;
    const actual = await tx.contrato.findFirst({ where: { id } });
    if (!actual) throw new ErrorRetail("Contrato inexistente", 404);
    const datos = validarContrato({ ...actual, ...cambios });
    const baja = datos.estado === "baja" && (actual.estado !== "baja" || datos.fechaBaja?.getTime() !== actual.fechaBaja?.getTime());
    if (baja && !esAdmin) throw new ErrorRetail("Solo Administrador puede dar de baja y cancelar cobros futuros", 403);
    if (baja && (!datos.fechaBaja || cambios.confirmarBaja !== true)) throw new ErrorRetail("Usa Dar de baja, selecciona fecha y confirma la cancelación de cobros futuros");
    await validarReferencias(tx, datos);
    const cobros = await tx.cobro.count({ where: { contratoId: id } });
    if (cobros && (datos.contactoId !== actual.contactoId || !iguales(datos.montoCierre, actual.montoCierre) || !iguales(datos.anticipoPct, actual.anticipoPct))) {
      throw new ErrorRetail("Con cobros registrados no se cambia el cliente, cierre ni porcentaje de anticipo", 409);
    }
    const contrato = await tx.contrato.update({ where: { id }, data: datos });
    if (baja) {
      await tx.$queryRaw`SELECT id FROM cobros WHERE contrato_id = ${id} ORDER BY id FOR UPDATE`;
      const motivo = `Cancelado al dar de baja el contrato: ${datos.fechaBaja!.toISOString().slice(0,10)}. Los abonos recibidos se conservan.`;
      await tx.$executeRaw`UPDATE cobros SET estado='cancelado', nota=concat_ws(E'\n',nota,${motivo}) WHERE contrato_id=${id} AND estado IN ('pendiente','vencido') AND vence > ${datos.fechaBaja!}`;
    }
    if (!cobros) {
      const cargos = cargosCierre(datos.montoCierre, datos.anticipoPct);
      if (cargos.length) await tx.cobro.createMany({ data: cargos.map((cargo) => ({ ...cargo, contratoId: id })) });
    }
    return contrato;
  });
}

function iguales(a: Prisma.Decimal | null, b: Prisma.Decimal | null) {
  return a === null ? b === null : b !== null && a.eq(b);
}
