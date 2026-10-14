import { Prisma } from "@prisma/client";
import { ErrorRetail, transaccionTenant } from "@/lib/retail-db";
import { fechaAR, hoyAR, mensualidadDelMes, mesSiguiente, METODOS_COBRO, montoOpcional } from "@/lib/contratos-cobros";
import { saldoCobro, type AbonoAR } from "@/lib/ar-vistas";
import { instanteLocal } from "@/lib/reservas/horarios";

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
    const pagos = (Array.isArray(cobro.pagos) ? cobro.pagos : []) as AbonoAR[];
    const clave = String(body.clavePago ?? "");
    const previo = clave && (body.estado ?? "pagado") === "pagado" ? pagos.find(pago => pago.clave === clave) : undefined;
    if (previo) {
      const monto = body.monto === undefined ? null : montoOpcional(body.monto);
      if ((body.monto !== undefined && (!monto || !monto.eq(previo.monto))) || (body.metodo !== undefined && body.metodo !== previo.metodo)) throw new ErrorRetail("Ese pago ya se registró con otros datos", 409);
      if ((body.referencia !== undefined && (String(body.referencia).trim() || null) !== previo.referencia) || (body.fechaPago !== undefined && String(body.fechaPago) !== hoyAR(new Date(previo.pagadoEn)))) throw new ErrorRetail("Ese pago ya se registró con otra fecha o referencia", 409);
      return { cobro, saldo: saldoCobro(cobro), repetido: true };
    }
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
    if (estado === "pagado") {
      const saldo = saldoCobro(cobro);
      const monto = body.monto === undefined ? saldo : montoOpcional(body.monto);
      if (!monto?.gt(0) || monto.gt(saldo)) throw new ErrorRetail("El pago debe ser mayor que cero y no superar el saldo");
      if ((body.monto !== undefined || clave) && !/^[\w-]{8,128}$/.test(clave)) throw new ErrorRetail("Falta un identificador válido para registrar el pago");
      const fecha = body.fechaPago === undefined ? null : fechaAR(body.fechaPago);
      if (body.fechaPago !== undefined && !fecha) throw new ErrorRetail("Selecciona la fecha de pago");
      if (fecha && fecha > fechaAR(hoyAR())!) throw new ErrorRetail("La fecha de pago no puede ser futura");
      const pagadoEn = fecha ? instanteLocal(fecha.toISOString().slice(0,10), 0, "America/Mexico_City") : new Date();
      const montoPagado = cobro.montoPagado.plus(monto);
      const restante = cobro.monto.minus(montoPagado);
      const estadoFinal = restante.isZero() ? "pagado" : cobro.vence && cobro.vence < fechaAR(hoyAR())! ? "vencido" : "pendiente";
      const referencia = String(body.referencia ?? "").trim() || null;
      const abono: AbonoAR = { clave: clave || `liquidacion-${cobro.id}`, monto: monto.toString(), pagadoEn: pagadoEn.toISOString(), metodo, referencia };
      const actualizado = await tx.cobro.update({ where: { id }, data: { estado: estadoFinal, montoPagado, pagos: [...pagos, abono], pagadoEn, metodo, referencia, ...(nota ? { nota } : {}) } });
      return { cobro: actualizado, saldo: restante, repetido: false };
    }
    return {
      cobro: await tx.cobro.update({ where: { id }, data: {
        estado, nota, ...(estado === "pagado" ? { metodo, pagadoEn: new Date(), referencia: String(body.referencia ?? "").trim() || null } : {}),
      } }),
      repetido: false,
    };
  });
}

export function crearCobro(orgId: bigint, body: Record<string, unknown>) {
  return transaccionTenant(orgId, async (tx) => {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ErrorRetail("Datos de cobro inválidos");
    const idTexto = String(body.contratoId ?? "");
    if (!/^\d+$/.test(idTexto)) throw new ErrorRetail("Contrato inválido");
    const contratoId = BigInt(idTexto);
    await tx.$queryRaw`SELECT id FROM contratos WHERE id = ${contratoId} FOR UPDATE`;
    if (!(await tx.contrato.findFirst({ where: { id: contratoId } }))) throw new ErrorRetail("Contrato inexistente o de otra empresa", 400);
    const monto = montoOpcional(body.monto);
    if (!monto?.gt(0)) throw new ErrorRetail("El monto debe ser mayor que cero");
    const concepto = String(body.concepto ?? "extra");
    if (!["anticipo", "balance", "mensualidad", "extra"].includes(concepto)) throw new ErrorRetail("Concepto inválido");
    const periodo = fechaAR(body.periodo);
    if (concepto === "mensualidad" ? !periodo || periodo.getUTCDate() !== 1 : periodo !== null) throw new ErrorRetail("Mensualidad requiere el primer día del mes; otros conceptos no llevan periodo");
    if (concepto !== "extra" && await tx.cobro.findFirst({ where: { contratoId, concepto, periodo } })) throw new ErrorRetail(`Ya existe un cobro de ${concepto}${periodo ? ` para ${periodo.toISOString().slice(0,7)}` : " en este contrato"}`, 409);
    return tx.cobro.create({ data: { contratoId, concepto, periodo, monto, vence: fechaAR(body.vence), nota: String(body.nota ?? "").trim() || null } });
  });
}

export const incluirContrato = { contrato: { include: { contacto: { select: { id: true, nombre: true } } } } } satisfies Prisma.CobroInclude;
