import { Prisma } from "@prisma/client";
import { ErrorRetail, transaccionTenant } from "@/lib/retail-db";
import { fechaAR, hoyAR, mensualidadDelMes, mesSiguiente, METODOS_COBRO, montoOpcional } from "@/lib/contratos-cobros";

export function generarCobros(orgId: bigint, hoy = hoyAR()) {
  return transaccionTenant(orgId, async (tx) => {
    const modulo = await tx.moduloOrg.findFirst({ where: { clave: "cobros", activo: true } });
    if (!modulo) return { generados: 0, vencidos: 0 };
    // El contrato es el punto común del cron y de la edición de sus condiciones.
    await tx.$queryRaw`SELECT id FROM contratos ORDER BY id FOR UPDATE`;
    const contratos = await tx.contrato.findMany({ orderBy: { id: "asc" } });
    const periodo = mesSiguiente(hoy);
    const cargos = contratos.flatMap((contrato) => {
      const cargo = mensualidadDelMes(contrato, periodo);
      return cargo ? [{ ...cargo, contratoId: contrato.id }] : [];
    });
    const generados = cargos.length ? (await tx.cobro.createMany({ data: cargos, skipDuplicates: true })).count : 0;
    const vencidos = (await tx.cobro.updateMany({ where: { estado: "pendiente", vence: { lt: fechaAR(hoy)! } }, data: { estado: "vencido" } })).count;
    return { generados, vencidos };
  });
}

export function cambiarCobro(orgId: bigint, id: bigint, body: Record<string, unknown>, esAdmin: boolean) {
  return transaccionTenant(orgId, async (tx) => {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ErrorRetail("Datos de cobro inválidos");
    await tx.$queryRaw`SELECT id FROM cobros WHERE id = ${id} FOR UPDATE`;
    const cobro = await tx.cobro.findFirst({ where: { id } });
    if (!cobro) throw new ErrorRetail("Cobro inexistente", 404);
    if (body.vence !== undefined && body.estado === undefined) {
      if (!["pendiente", "vencido"].includes(cobro.estado)) throw new ErrorRetail("El cobro ya está cerrado", 409);
      const vence = fechaAR(body.vence);
      const estado = vence && vence < fechaAR(hoyAR())! ? "vencido" : "pendiente";
      return { cobro: await tx.cobro.update({ where: { id }, data: { vence, estado } }), repetido: false };
    }
    const estado = String(body.estado ?? "pagado");
    const nota = String(body.nota ?? "").trim() || null;
    if (!["pagado", "incobrable", "cancelado"].includes(estado)) throw new ErrorRetail("Estado inválido");
    if (estado !== "pagado" && !esAdmin) throw new ErrorRetail("Solo Administrador puede cancelar o marcar incobrable", 403);
    if (estado !== "pagado" && !nota) throw new ErrorRetail("La nota es obligatoria");
    if (cobro.estado === estado) return { cobro, repetido: true };
    if (!["pendiente", "vencido"].includes(cobro.estado)) throw new ErrorRetail("El cobro ya está cerrado", 409);
    const metodo = String(body.metodo ?? "");
    if (estado === "pagado" && !(METODOS_COBRO as readonly string[]).includes(metodo)) throw new ErrorRetail("Selecciona un método de pago válido");
    return {
      cobro: await tx.cobro.update({ where: { id }, data: {
        estado, nota, ...(estado === "pagado" ? { metodo, pagadoEn: new Date(), referencia: String(body.referencia ?? "").trim() || null } : {}),
      } }),
      repetido: false,
    };
  });
}

export function crearCobroExtra(orgId: bigint, body: Record<string, unknown>) {
  return transaccionTenant(orgId, async (tx) => {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ErrorRetail("Datos de cobro inválidos");
    const idTexto = String(body.contratoId ?? "");
    if (!/^\d+$/.test(idTexto)) throw new ErrorRetail("Contrato inválido");
    const contratoId = BigInt(idTexto);
    await tx.$queryRaw`SELECT id FROM contratos WHERE id = ${contratoId} FOR UPDATE`;
    if (!(await tx.contrato.findFirst({ where: { id: contratoId } }))) throw new ErrorRetail("Contrato inexistente o de otra empresa", 400);
    const monto = montoOpcional(body.monto);
    if (!monto?.gt(0)) throw new ErrorRetail("El monto debe ser mayor que cero");
    return tx.cobro.create({ data: { contratoId, concepto: "extra", monto, vence: fechaAR(body.vence), nota: String(body.nota ?? "").trim() || null } });
  });
}

export const incluirContrato = { contrato: { include: { contacto: { select: { id: true, nombre: true } } } } } satisfies Prisma.CobroInclude;
