import { Prisma } from "@prisma/client";
import { dinero } from "./dinero.ts";

export const TIPOS_CONTRATO = ["bot_whatsapp", "bot_facebook", "agente_odoo", "web", "seo", "panel", "otro"] as const;
export const ESTADOS_CONTRATO = ["en_desarrollo", "en_pruebas", "produccion", "pausado", "baja", "incobrable"] as const;
export const METODOS_COBRO = ["transferencia", "tarjeta", "efectivo", "mercado_pago"] as const;
export const ZONA_AR = "America/Mexico_City";

export function hoyAR(ahora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_AR }).format(ahora);
}

export function fechaAR(valor: unknown): Date | null {
  if (valor == null || valor === "") return null;
  const texto = valor instanceof Date ? valor.toISOString().slice(0, 10) : String(valor);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) throw new RangeError("Fecha inválida");
  const fecha = new Date(`${texto}T00:00:00Z`);
  if (!Number.isFinite(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== texto) throw new RangeError("Fecha inválida");
  return fecha;
}

export function mesSiguiente(fecha: string) {
  const base = fechaAR(fecha)!;
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 1));
}

export function vencimientoMes(periodo: Date, dia: number) {
  return new Date(Date.UTC(periodo.getUTCFullYear(), periodo.getUTCMonth(), Math.max(1, Math.min(28, dia))));
}

export function montoOpcional(valor: unknown) {
  if (valor == null || valor === "") return null;
  if (dinero(valor) === null) throw new RangeError("Monto inválido; usa hasta dos decimales");
  return new Prisma.Decimal(String(valor));
}

type ContratoMRR = {
  estado: string | null; mensualidad: Prisma.Decimal | null;
  inicioMensualidad: Date | null; fechaBaja?: Date | null; diaCobro: number | null;
};

export function elegibleMRR(contrato: ContratoMRR, fecha: Date) {
  return contrato.estado === "produccion" && Boolean(contrato.mensualidad?.gt(0))
    && (!contrato.inicioMensualidad || contrato.inicioMensualidad <= fecha)
    && (!contrato.fechaBaja || contrato.fechaBaja > fecha);
}

export function mensualidadDelMes(contrato: ContratoMRR, periodo: Date) {
  if (contrato.diaCobro === null) return null;
  const vence = vencimientoMes(periodo, contrato.diaCobro);
  if (!elegibleMRR(contrato, vence)) return null;
  return { concepto: "mensualidad", periodo, vence, monto: contrato.mensualidad! };
}

export function validarContrato(body: Record<string, unknown>) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new RangeError("Datos de contrato inválidos");
  const contactoId = /^\d+$/.test(String(body.contactoId)) ? BigInt(String(body.contactoId)) : null;
  const oportunidadId = body.oportunidadId ? (/^\d+$/.test(String(body.oportunidadId)) ? BigInt(String(body.oportunidadId)) : null) : null;
  const tipo = String(body.tipo ?? "");
  const estado = body.estado ? String(body.estado) : null;
  const diaCobro = body.diaCobro == null || body.diaCobro === "" ? null : Number(body.diaCobro);
  if (!contactoId || (body.oportunidadId && !oportunidadId)) throw new RangeError("Referencia inválida");
  if (!(TIPOS_CONTRATO as readonly string[]).includes(tipo)) throw new RangeError("Tipo inválido");
  if (estado && !(ESTADOS_CONTRATO as readonly string[]).includes(estado)) throw new RangeError("Estado inválido");
  if (diaCobro !== null && (!/^\d+$/.test(String(body.diaCobro)) || !Number.isInteger(diaCobro) || diaCobro < 1 || diaCobro > 28)) throw new RangeError("Día de cobro: 1 a 28");
  const anticipoPct = montoOpcional(body.anticipoPct === undefined ? "50" : body.anticipoPct);
  if (anticipoPct?.gt(100)) throw new RangeError("Anticipo: 0 a 100 %");
  return {
    contactoId, oportunidadId, tipo, estado, diaCobro, anticipoPct,
    montoCierre: montoOpcional(body.montoCierre), mensualidad: montoOpcional(body.mensualidad),
    inicioMensualidad: fechaAR(body.inicioMensualidad), fechaBaja: fechaAR(body.fechaBaja),
    notas: String(body.notas ?? "").trim() || null,
  };
}

export function cargosCierre(monto: Prisma.Decimal | null, porcentaje: Prisma.Decimal | null) {
  if (!monto?.gt(0) || porcentaje === null) return [];
  const anticipo = monto.mul(porcentaje).div(100).toDecimalPlaces(2);
  return [{ concepto: "anticipo", monto: anticipo }, { concepto: "balance", monto: monto.minus(anticipo) }].filter((cargo) => cargo.monto.gt(0));
}

export function configPanelAR(valor: unknown) {
  const config = (valor ?? {}) as Record<string, unknown>;
  const porcentaje = (campo: string, base: string) => {
    const monto = montoOpcional(config[campo] ?? base);
    if (monto === null || monto.gt(100)) throw new RangeError("Porcentaje inválido");
    return monto;
  };
  const creditoIA = montoOpcional(config.credito_ia_mxn ?? "100");
  if (creditoIA === null) throw new RangeError("Crédito IA inválido");
  return {
    proyectoCtoPct: porcentaje("proyectoCtoPct", "70"),
    mensualidadCtoPct: porcentaje("mensualidadCtoPct", "50"),
    creditoIA,
  };
}

type PagoComision = { id: bigint | string; contactoId: bigint; concepto: string; monto: Prisma.Decimal; periodo: Date | null; pagadoEn?: Date | null };

/** El crédito se resta una vez por cliente y mes de servicio, repartido entre sus cobros. */
export function repartirComisiones(pagos: PagoComision[], config: ReturnType<typeof configPanelAR>) {
  const creditos = new Map<string, Prisma.Decimal>();
  return [...pagos].sort((a, b) => (a.pagadoEn?.getTime() ?? 0) - (b.pagadoEn?.getTime() ?? 0) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true })).map((pago) => {
    const pendiente = !["anticipo", "balance", "mensualidad"].includes(pago.concepto);
    const mensual = pago.concepto === "mensualidad";
    const clave = `${pago.contactoId}:${pago.periodo?.toISOString().slice(0, 7)}`;
    const disponible = creditos.get(clave) ?? config.creditoIA;
    const creditoIA = mensual ? Prisma.Decimal.min(disponible, pago.monto) : new Prisma.Decimal(0);
    if (mensual) creditos.set(clave, disponible.minus(creditoIA));
    const base = pago.monto.minus(creditoIA);
    const cto = pendiente ? new Prisma.Decimal(0) : base.mul(mensual ? config.mensualidadCtoPct : config.proyectoCtoPct).div(100).toDecimalPlaces(2);
    return { id: pago.id, creditoIA, base, cto, ceo: pendiente ? new Prisma.Decimal(0) : base.minus(cto), pendiente };
  });
}
