import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { transaccionTenant } from "@/lib/retail-db";
import { calcularFactura, conceptosDesdeSnapshots, conceptosDesdeTotal, totalCoincide } from "./calcular";
import { ErrorCfdi } from "./errores";
import { obtenerProveedorFactura } from "./proveedor";
import {
  validarConceptos,
  validarDatosEmisor,
  validarDatosFiscales,
  validarEntradaFactura,
  validarMoneda,
  validarMotivoCancelacion,
} from "./validar";
import type {
  ArchivoFactura,
  CalculoFactura,
  ConceptoNormalizado,
  ConsultaFactura,
  DatosTimbrado,
  EntradaFactura,
  EstadoFactura,
  FormatoFactura,
} from "./tipos";

const selectConcepto = {
  id: true,
  orgId: true,
  facturaId: true,
  descripcion: true,
  cantidad: true,
  valorUnitario: true,
  importe: true,
  iva: true,
  retenciones: true,
  ivaTasa: true,
  ivaExento: true,
  retencionTasa: true,
  claveProdServ: true,
  claveUnidad: true,
  createdAt: true,
} satisfies Prisma.ConceptoFacturaSelect;

const selectFactura = {
  id: true,
  orgId: true,
  ventaId: true,
  pagoId: true,
  contactoId: true,
  proveedor: true,
  serie: true,
  folio: true,
  uuid: true,
  estado: true,
  subtotal: true,
  impuestos: true,
  retenciones: true,
  total: true,
  moneda: true,
  formaPago: true,
  metodoPago: true,
  usoCfdi: true,
  xmlUrl: true,
  pdfUrl: true,
  error: true,
  idempotencyKey: true,
  timbrandoAt: true,
  timbradaAt: true,
  canceladaAt: true,
  receptorRfc: true,
  receptorRazonSocial: true,
  receptorRegimenFiscal: true,
  receptorCodigoPostal: true,
  receptorUsoCfdi: true,
  receptorCorreo: true,
  emisorRfc: true,
  emisorRazonSocial: true,
  emisorRegimenFiscal: true,
  emisorCodigoPostal: true,
  createdAt: true,
  updatedAt: true,
  conceptos: { select: selectConcepto, orderBy: { id: "asc" } },
  contacto: { select: { id: true, nombre: true, email: true } },
  venta: { select: { id: true, folio: true, estado: true } },
  pago: { select: { id: true, referenciaExterna: true, monto: true, moneda: true, estado: true } },
} satisfies Prisma.FacturaSelect;

export type FacturaConDetalle = Prisma.FacturaGetPayload<{ select: typeof selectFactura }>;

type Origen = {
  ventaId?: bigint;
  pagoId?: bigint;
  contactoId: bigint | null;
  total: number;
  moneda: string;
  descripcion: string;
  conceptos?: ConceptoNormalizado[];
};

const ESTADOS_ACTIVOS = ["borrador", "timbrando", "timbrada"] as const;
const MINUTOS_TIMBRANDO = 10;

async function cargarFactura(id: bigint) {
  return db.factura.findFirst({ where: { id }, select: selectFactura });
}

export async function obtenerFactura(id: bigint) {
  return cargarFactura(id);
}

export async function obtenerDatosFiscales(contactoId: bigint) {
  return db.datosFiscales.findFirst({ where: { contactoId, activo: true } });
}

export async function guardarDatosFiscales(
  orgId: bigint,
  contactoId: bigint,
  valor: unknown,
) {
  const validado = validarDatosFiscales(valor);
  if (!validado.ok) throw new ErrorCfdi(validado.error, 400);
  const contacto = await db.contacto.findFirst({ where: { id: contactoId }, select: { id: true } });
  if (!contacto) throw new ErrorCfdi("El contacto no existe", 404);

  return db.datosFiscales.upsert({
    where: { orgId_contactoId: { orgId, contactoId } },
    create: { orgId, contactoId, ...validado.valor, activo: true },
    update: { ...validado.valor, activo: true },
  });
}

export async function obtenerEmisor() {
  return db.datosEmisor.findFirst();
}

export async function guardarEmisor(orgId: bigint, valor: unknown) {
  const validado = validarDatosEmisor(valor);
  if (!validado.ok) throw new ErrorCfdi(validado.error, 400);
  if (validado.valor.proveedor !== "mock") {
    throw new ErrorCfdi(
      "Solo el proveedor mock está disponible en Fase 2A; Facturama y SW Sapien son Fase 2B",
      409,
      "proveedor_fase_2b",
    );
  }

  return transaccionTenant(orgId, async (tx) => {
    const ultimo = await tx.$queryRaw<Array<{ max: bigint | null }>>`
      SELECT MAX(folio::bigint) AS max
      FROM facturas
      WHERE org_id = ${orgId}
        AND serie = ${validado.valor.serie}
        AND folio ~ '^[0-9]+$'
    `;
    const maximo = ultimo[0]?.max;
    if (maximo !== null && maximo !== undefined && validado.valor.folioSiguiente <= Number(maximo)) {
      throw new ErrorCfdi(
        `El folio siguiente debe ser mayor al último folio usado (${maximo}) para la serie ${validado.valor.serie}`,
        409,
        "folio_decreciente",
      );
    }

    return tx.datosEmisor.upsert({
      where: { orgId },
      create: { orgId, ...validado.valor },
      update: { ...validado.valor },
    });
  });
}

async function resolverOrigen(entrada: EntradaFactura): Promise<Origen> {
  if (entrada.ventaId) {
    const venta = await db.venta.findFirst({
      where: { id: BigInt(entrada.ventaId) },
      select: {
        id: true, folio: true, total: true, moneda: true, estado: true, contactoId: true, costoEnvio: true, ivaEnvio: true,
        partidas: { select: { total: true, baseImporte: true, ivaImporte: true, ivaTasa: true, ivaExento: true, producto: { select: { nombre: true } } }, orderBy: { id: "asc" } },
      },
    });
    if (!venta) throw new ErrorCfdi("La venta no existe", 404);
    if (venta.estado === "cancelada") throw new ErrorCfdi("No se puede facturar una venta cancelada", 409);
    const total = Number(venta.total);
    if (!Number.isFinite(total) || total <= 0) throw new ErrorCfdi("La venta no tiene un total facturable", 409);
    const partidasConSnapshot = venta.partidas.length > 0 && venta.partidas.every((partida) => partida.baseImporte !== null && partida.ivaImporte !== null && partida.ivaTasa !== null && partida.ivaExento !== null);
    let conceptos: ConceptoNormalizado[] | undefined;
    if (partidasConSnapshot) {
      const snapshots = venta.partidas.map((partida, indice) => ({
        descripcion: `${partida.producto.nombre} · venta ${venta.folio} · partida ${indice + 1}`,
        baseImporte: partida.baseImporte!,
        ivaTasa: partida.ivaTasa!,
        ivaExento: partida.ivaExento!,
      }));
      if (venta.costoEnvio.gt(0)) {
        snapshots.push({
          descripcion: `Envío · venta ${venta.folio}`,
          baseImporte: venta.costoEnvio.minus(venta.ivaEnvio),
          ivaTasa: new Prisma.Decimal("0.16"),
          ivaExento: false,
        });
      }
      try {
        conceptos = conceptosDesdeSnapshots(Number(venta.total), snapshots);
      } catch {
        throw new ErrorCfdi("Los snapshots fiscales de la venta no suman su total; no se puede emitir CFDI", 409);
      }
    }
    return {
      ventaId: venta.id,
      contactoId: venta.contactoId ?? (entrada.contactoId ? BigInt(entrada.contactoId) : null),
      total,
      moneda: venta.moneda,
      descripcion: `Venta ${venta.folio}`,
      ...(conceptos ? { conceptos } : {}),
    };
  }

  const pago = await db.pagoOnline.findFirst({
    where: { id: BigInt(entrada.pagoId!) },
    select: {
      id: true, origenTipo: true, origenId: true, monto: true, montoReembolsado: true,
      moneda: true, estado: true, referenciaExterna: true,
    },
  });
  if (!pago) throw new ErrorCfdi("El pago no existe", 404);
  if (pago.estado !== "aprobado") throw new ErrorCfdi("Solo se pueden facturar pagos aprobados", 409);
  const total = Number(pago.monto) - Number(pago.montoReembolsado);
  if (!Number.isFinite(total) || total <= 0) throw new ErrorCfdi("El pago no tiene un monto facturable", 409);

  let contactoId = entrada.contactoId ? BigInt(entrada.contactoId) : null;
  if (!contactoId && pago.origenTipo === "venta") {
    const venta = await db.venta.findFirst({
      where: { id: pago.origenId },
      select: { contactoId: true },
    });
    contactoId = venta?.contactoId ?? null;
  }

  return {
    pagoId: pago.id,
    contactoId,
    total,
    moneda: pago.moneda,
    descripcion: `Pago ${pago.referenciaExterna ?? pago.id.toString()}`,
  };
}

function conceptosParaFactura(
  entrada: EntradaFactura,
  origen: Origen,
): { conceptos: ConceptoNormalizado[]; calculo: CalculoFactura } {
  if (entrada.conceptos) {
    const validados = validarConceptos(entrada.conceptos);
    if (!validados.ok) throw new ErrorCfdi(validados.error, 400);
    const calculo = calcularFactura(validados.valor);
    if (!totalCoincide(calculo.total, origen.total)) {
      throw new ErrorCfdi(
        `El total de los conceptos (${calculo.total.toFixed(2)}) no coincide con el origen (${origen.total.toFixed(2)})`,
        400,
      );
    }
    return { conceptos: validados.valor, calculo };
  }

  if (origen.conceptos) {
    const calculo = calcularFactura(origen.conceptos);
    if (!totalCoincide(calculo.total, origen.total)) throw new ErrorCfdi("Los snapshots fiscales no coinciden con el total de la venta", 409);
    return { conceptos: origen.conceptos, calculo };
  }

  let conceptos: ConceptoNormalizado[];
  try {
    conceptos = conceptosDesdeTotal(origen.total, entrada.descripcion || origen.descripcion);
  } catch (error) {
    throw new ErrorCfdi(
      error instanceof Error ? error.message : "No se pudo desglosar el total del origen",
      409,
    );
  }
  if (conceptos.length === 0) throw new ErrorCfdi("El origen no tiene un total facturable", 409);
  const calculo = calcularFactura(conceptos);
  if (!totalCoincide(calculo.total, origen.total)) {
    throw new ErrorCfdi("No se pudo desglosar el total del origen", 409);
  }
  return { conceptos, calculo };
}

async function asignarFolio(orgId: bigint) {
  const filas = await transaccionTenant(orgId, (tx) => tx.$queryRaw<Array<{ folio: number }>>`
    UPDATE datos_emisor
    SET folio_siguiente = folio_siguiente + 1, updated_at = now()
    WHERE org_id = ${orgId}
    RETURNING folio_siguiente - 1 AS folio
  `);
  const folio = filas[0]?.folio;
  if (!Number.isInteger(folio) || folio < 1) {
    throw new ErrorCfdi("No se pudo asignar el folio de la factura", 409);
  }
  return String(folio);
}

async function reclamarFactura(orgId: bigint, facturaId: bigint) {
  return transaccionTenant(orgId, (tx) => tx.$queryRaw<Array<{ id: bigint }>>`
    UPDATE facturas
    SET estado = 'timbrando',
        timbrando_at = now(),
        error = NULL,
        updated_at = now()
    WHERE id = ${facturaId}
      AND org_id = ${orgId}
      AND (
        estado IN ('borrador','error')
        OR (estado = 'timbrando' AND timbrando_at < now() - make_interval(mins => ${MINUTOS_TIMBRANDO}::int))
      )
    RETURNING id
  `);
}

async function registrarEventoError(orgId: bigint, facturaId: bigint, tipo: string, mensaje: string) {
  try {
    await transaccionTenant(orgId, (tx) => tx.eventoFactura.create({
      data: {
        org: { connect: { id: orgId } },
        factura: { connect: { id: facturaId } },
        eventoId: `${tipo}:${randomUUID()}`,
        tipo,
        payload: { mensaje: mensaje.slice(0, 1000) },
        procesadoAt: new Date(),
      },
    }));
  } catch {
    // No enmascarar el error original del PAC.
  }
}

async function marcarError(orgId: bigint, facturaId: bigint, mensaje: string, folio?: string, serie?: string) {
  try {
    await transaccionTenant(orgId, async (tx) => {
      await tx.factura.update({
        where: { id: facturaId },
        data: {
          estado: "error",
          timbrandoAt: null,
          error: mensaje.slice(0, 1000),
          ...(folio ? { folio } : {}),
          ...(serie ? { serie } : {}),
        },
      });
      await tx.eventoFactura.create({
        data: {
          org: { connect: { id: orgId } },
          factura: { connect: { id: facturaId } },
          eventoId: `error:${randomUUID()}`,
          tipo: "error",
          payload: { mensaje: mensaje.slice(0, 1000) },
          procesadoAt: new Date(),
        },
      });
    });
  } catch {
    // No enmascarar el error original del PAC.
  }
}

function errorTimbradoEnProceso() {
  return new ErrorCfdi("La factura está en proceso de timbrado; intenta de nuevo en unos segundos", 409, "timbrado_en_proceso");
}

export async function crearFactura(orgId: bigint, valor: unknown) {
  const entradaValidada = validarEntradaFactura(valor);
  if (!entradaValidada.ok) throw new ErrorCfdi(entradaValidada.error, 400);
  const entrada = entradaValidada.valor;
  const idempotencyKey = entrada.idempotencyKey ?? randomUUID();

  const existente = await db.factura.findFirst({
    where: { idempotencyKey },
    select: selectFactura,
  });
  if (existente) return { factura: existente, duplicado: true };

  const origen = await resolverOrigen(entrada);
  const moneda = validarMoneda(origen.moneda);
  if (!moneda.ok) throw new ErrorCfdi(moneda.error, 400);
  if (!origen.contactoId) throw new ErrorCfdi("La venta o el pago no tiene un cliente asociado", 400);

  const fiscal = await db.datosFiscales.findFirst({
    where: { contactoId: origen.contactoId, activo: true },
  });
  if (!fiscal) throw new ErrorCfdi("El cliente no tiene datos fiscales activos", 400);
  const receptor = validarDatosFiscales({
    rfc: fiscal.rfc,
    razonSocial: fiscal.razonSocial,
    regimenFiscal: fiscal.regimenFiscal,
    codigoPostal: fiscal.codigoPostal,
    usoCfdi: fiscal.usoCfdi,
    correo: fiscal.correo ?? undefined,
  });
  if (!receptor.ok) throw new ErrorCfdi(`Datos fiscales inválidos: ${receptor.error}`, 400);

  const emisorDb = await db.datosEmisor.findFirst();
  if (!emisorDb) throw new ErrorCfdi("Configura el emisor de facturación antes de facturar", 400);
  const emisor = validarDatosEmisor({
    rfc: emisorDb.rfc,
    razonSocial: emisorDb.razonSocial,
    regimenFiscal: emisorDb.regimenFiscal,
    codigoPostal: emisorDb.codigoPostal,
    serie: emisorDb.serie,
    folioSiguiente: emisorDb.folioSiguiente,
    ambiente: emisorDb.ambiente,
    proveedor: emisorDb.proveedor,
  });
  if (!emisor.ok) throw new ErrorCfdi(`Configuración del emisor inválida: ${emisor.error}`, 400);

  const { calculo } = conceptosParaFactura(entrada, origen);
  if (calculo.total <= 0) throw new ErrorCfdi("El total de la factura debe ser mayor que cero", 400);

  const activa = await db.factura.findFirst({
    where: {
      estado: { in: [...ESTADOS_ACTIVOS] },
      ...(origen.ventaId ? { ventaId: origen.ventaId } : { pagoId: origen.pagoId }),
    },
    select: selectFactura,
  });
  if (activa) {
    if (activa.estado === "timbrada") return { factura: activa, duplicado: true };
    if (activa.estado === "timbrando") throw errorTimbradoEnProceso();
    throw new ErrorCfdi("Ya existe una factura en borrador para este origen", 409);
  }

  let creada: FacturaConDetalle;
  try {
    creada = await transaccionTenant(orgId, async (tx) => {
      const factura = await tx.factura.create({
        data: {
          org: { connect: { id: orgId } },
          venta: origen.ventaId ? { connect: { id: origen.ventaId } } : undefined,
          pago: origen.pagoId ? { connect: { id: origen.pagoId } } : undefined,
          contacto: origen.contactoId ? { connect: { id: origen.contactoId } } : undefined,
          proveedor: emisor.valor.proveedor,
          serie: emisor.valor.serie,
          estado: "borrador",
          subtotal: calculo.subtotal,
          impuestos: calculo.impuestos,
          retenciones: calculo.retenciones,
          total: calculo.total,
          moneda: moneda.valor,
          formaPago: entrada.formaPago ?? "99",
          metodoPago: entrada.metodoPago ?? "PUE",
          usoCfdi: entrada.usoCfdi ?? receptor.valor.usoCfdi,
          idempotencyKey,
          conceptos: {
            create: calculo.conceptos.map((concepto) => ({
              descripcion: concepto.descripcion,
              cantidad: concepto.cantidad,
              valorUnitario: concepto.valorUnitario,
              importe: concepto.importe,
              iva: concepto.iva,
              retenciones: concepto.retenciones,
              ivaTasa: concepto.ivaTasa,
              ivaExento: concepto.ivaExento ?? false,
              retencionTasa: concepto.retencionTasa,
              claveProdServ: concepto.claveProdServ ?? null,
              claveUnidad: concepto.claveUnidad ?? null,
            })),
          },
        },
        select: selectFactura,
      });
      await tx.eventoFactura.create({
        data: {
          org: { connect: { id: orgId } },
          factura: { connect: { id: factura.id } },
          eventoId: `creada:${randomUUID()}`,
          tipo: "creada",
          payload: {
            origen: origen.ventaId ? "venta" : "pago",
            total: calculo.total,
            proveedor: emisor.valor.proveedor,
          },
          procesadoAt: new Date(),
        },
      });
      return factura;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const porClave = await db.factura.findFirst({ where: { idempotencyKey }, select: selectFactura });
      if (porClave) return { factura: porClave, duplicado: true };
      const porOrigen = await db.factura.findFirst({
        where: {
          estado: { in: [...ESTADOS_ACTIVOS] },
          ...(origen.ventaId ? { ventaId: origen.ventaId } : { pagoId: origen.pagoId }),
        },
        select: selectFactura,
      });
      if (porOrigen) {
        if (porOrigen.estado === "timbrando") throw errorTimbradoEnProceso();
        return { factura: porOrigen, duplicado: true };
      }
      throw new ErrorCfdi("Ya existe una factura para este origen", 409);
    }
    throw error;
  }

  if (!entrada.timbrar) return { factura: creada, duplicado: false };
  const timbrada = await timbrarFactura(orgId, creada.id);
  return { factura: timbrada, duplicado: false };
}

export async function timbrarFactura(orgId: bigint, facturaId: bigint) {
  const inicial = await cargarFactura(facturaId);
  if (!inicial) throw new ErrorCfdi("La factura no existe", 404);
  if (inicial.estado === "timbrada") return inicial;
  if (inicial.estado === "cancelada") throw new ErrorCfdi("Una factura cancelada no se puede timbrar", 409);
  if (inicial.conceptos.length === 0) throw new ErrorCfdi("La factura no tiene conceptos", 409);
  if (!inicial.contactoId) throw new ErrorCfdi("La factura no tiene receptor", 409);

  const reclamada = await reclamarFactura(orgId, facturaId);
  if (reclamada.length === 0) {
    const actual = await cargarFactura(facturaId);
    if (!actual) throw new ErrorCfdi("La factura no existe", 404);
    if (actual.estado === "timbrada") return actual;
    if (actual.estado === "timbrando") throw errorTimbradoEnProceso();
    if (actual.estado === "cancelada") throw new ErrorCfdi("Una factura cancelada no se puede timbrar", 409);
    throw new ErrorCfdi("No se pudo reclamar la factura para timbrado", 409);
  }

  let folioAsignado: string | undefined;
  let serieAsignada: string | undefined;
  try {
    const factura = await cargarFactura(facturaId);
    if (!factura) throw new ErrorCfdi("La factura no existe", 404);
    if (factura.estado !== "timbrando") {
      if (factura.estado === "timbrada") return factura;
      throw new ErrorCfdi("La factura cambió de estado antes del timbrado", 409);
    }

    const fiscal = await db.datosFiscales.findFirst({
      where: { contactoId: factura.contactoId!, activo: true },
    });
    if (!fiscal) throw new ErrorCfdi("El cliente no tiene datos fiscales activos", 409);
    const receptor = validarDatosFiscales({
      rfc: fiscal.rfc,
      razonSocial: fiscal.razonSocial,
      regimenFiscal: fiscal.regimenFiscal,
      codigoPostal: fiscal.codigoPostal,
      usoCfdi: factura.usoCfdi,
      correo: fiscal.correo ?? undefined,
    });
    if (!receptor.ok) throw new ErrorCfdi(`Datos fiscales inválidos: ${receptor.error}`, 409);

    const emisorDb = await db.datosEmisor.findFirst();
    if (!emisorDb) throw new ErrorCfdi("Configura el emisor de facturación", 409);
    const emisorValidado = validarDatosEmisor({
      rfc: emisorDb.rfc,
      razonSocial: emisorDb.razonSocial,
      regimenFiscal: emisorDb.regimenFiscal,
      codigoPostal: emisorDb.codigoPostal,
      serie: emisorDb.serie,
      folioSiguiente: emisorDb.folioSiguiente,
      ambiente: emisorDb.ambiente,
      proveedor: emisorDb.proveedor,
    });
    if (!emisorValidado.ok) throw new ErrorCfdi(`Configuración del emisor inválida: ${emisorValidado.error}`, 409);
    const emisor = emisorValidado.valor;

    const folio = factura.folio ?? await asignarFolio(orgId);
    folioAsignado = folio;
    const serie = factura.serie ?? emisor.serie;
    serieAsignada = serie;
    const datos: DatosTimbrado = {
      facturaId: factura.id.toString(),
      serie,
      folio,
      fecha: new Date().toISOString(),
      emisor,
      receptor: receptor.valor,
      conceptos: factura.conceptos.map((concepto) => ({
        descripcion: concepto.descripcion,
        cantidad: Number(concepto.cantidad),
        valorUnitario: Number(concepto.valorUnitario),
        ivaTasa: Number(concepto.ivaTasa),
        retencionTasa: Number(concepto.retencionTasa),
        importe: Number(concepto.importe),
        iva: Number(concepto.iva),
        retenciones: Number(concepto.retenciones),
        ...(concepto.claveProdServ ? { claveProdServ: concepto.claveProdServ } : {}),
        ...(concepto.claveUnidad ? { claveUnidad: concepto.claveUnidad } : {}),
      })),
      subtotal: Number(factura.subtotal),
      impuestos: Number(factura.impuestos),
      retenciones: Number(factura.retenciones),
      total: Number(factura.total),
      moneda: factura.moneda,
      formaPago: factura.formaPago,
      metodoPago: factura.metodoPago,
      usoCfdi: factura.usoCfdi,
    };

    const proveedor = obtenerProveedorFactura({ proveedor: emisor.proveedor });
    const resultado = await proveedor.timbrar(datos);

    return await transaccionTenant(orgId, async (tx) => {
      const actualizada = await tx.factura.update({
        where: { id: factura.id },
        data: {
          estado: "timbrada",
          uuid: resultado.uuid,
          serie: resultado.serie,
          folio: resultado.folio,
          xmlUrl: `/api/facturas/${factura.id}/xml`,
          pdfUrl: `/api/facturas/${factura.id}/pdf`,
          xml: resultado.xml,
          pdf: Buffer.from(resultado.pdf),
          error: null,
          timbrandoAt: null,
          timbradaAt: new Date(resultado.fechaTimbrado),
          receptorRfc: receptor.valor.rfc,
          receptorRazonSocial: receptor.valor.razonSocial,
          receptorRegimenFiscal: receptor.valor.regimenFiscal,
          receptorCodigoPostal: receptor.valor.codigoPostal,
          receptorUsoCfdi: datos.usoCfdi,
          receptorCorreo: receptor.valor.correo ?? null,
          emisorRfc: emisor.rfc,
          emisorRazonSocial: emisor.razonSocial,
          emisorRegimenFiscal: emisor.regimenFiscal,
          emisorCodigoPostal: emisor.codigoPostal,
        },
        select: selectFactura,
      });
      await tx.eventoFactura.create({
        data: {
          org: { connect: { id: orgId } },
          factura: { connect: { id: factura.id } },
          eventoId: `timbrada:${randomUUID()}`,
          tipo: "timbrada",
          payload: { uuid: resultado.uuid, proveedor: emisor.proveedor },
          procesadoAt: new Date(),
        },
      });
      return actualizada;
    });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "Error desconocido del PAC";
    await marcarError(orgId, facturaId, mensaje, folioAsignado, serieAsignada);
    if (error instanceof ErrorCfdi) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const actual = await cargarFactura(facturaId);
      if (actual?.estado === "timbrada") return actual;
      throw new ErrorCfdi("El folio ya fue usado por otra factura", 409, "folio_duplicado");
    }
    throw new ErrorCfdi("No se pudo timbrar la factura", 502, "pac_error");
  }
}

export async function cancelarFactura(orgId: bigint, facturaId: bigint, motivoValor: unknown) {
  const motivo = validarMotivoCancelacion(motivoValor);
  if (!motivo.ok) throw new ErrorCfdi(motivo.error, 400);

  const factura = await cargarFactura(facturaId);
  if (!factura) throw new ErrorCfdi("La factura no existe", 404);
  if (factura.estado === "cancelada") return factura;
  if (factura.estado !== "timbrada") throw new ErrorCfdi("Solo se pueden cancelar facturas timbradas", 409);
  if (!factura.uuid) throw new ErrorCfdi("La factura no tiene UUID", 409);

  const proveedor = obtenerProveedorFactura({ proveedor: factura.proveedor });
  let resultado;
  try {
    resultado = await proveedor.cancelar(factura.uuid, motivo.valor);
  } catch (error) {
    await registrarEventoError(orgId, factura.id, "error_cancelacion", error instanceof Error ? error.message : "Error de cancelación");
    if (error instanceof ErrorCfdi) throw error;
    throw new ErrorCfdi("No se pudo cancelar la factura", 502, "pac_error");
  }

  return transaccionTenant(orgId, async (tx) => {
    const actualizada = await tx.factura.update({
      where: { id: factura.id },
      data: { estado: "cancelada", canceladaAt: new Date(resultado.fechaCancelacion) },
      select: selectFactura,
    });
    await tx.eventoFactura.create({
      data: {
        org: { connect: { id: orgId } },
        factura: { connect: { id: factura.id } },
        eventoId: `cancelada:${randomUUID()}`,
        tipo: "cancelada",
        payload: { motivo: motivo.valor, uuid: factura.uuid },
        procesadoAt: new Date(),
      },
    });
    return actualizada;
  });
}

export async function consultarFactura(orgId: bigint, facturaId: bigint): Promise<ConsultaFactura> {
  const factura = await cargarFactura(facturaId);
  if (!factura) throw new ErrorCfdi("La factura no existe", 404);
  if (factura.estado !== "timbrada" && factura.estado !== "cancelada") {
    return {
      uuid: factura.uuid ?? "",
      estado: factura.estado as EstadoFactura,
      cancelable: false,
    };
  }
  if (factura.estado === "cancelada") {
    return {
      uuid: factura.uuid ?? "",
      estado: "cancelada",
      cancelable: false,
      fechaCancelacion: factura.canceladaAt?.toISOString(),
    };
  }
  if (!factura.uuid) return { uuid: "", estado: factura.estado, cancelable: false };

  const proveedor = obtenerProveedorFactura({ proveedor: factura.proveedor });
  const consulta = await proveedor.consultar(factura.uuid);
  return {
    ...consulta,
    uuid: factura.uuid,
    estado: consulta.estado === "cancelada" ? "cancelada" : factura.estado,
    cancelable: consulta.cancelable && factura.estado === "timbrada",
  };
}

function nombreArchivo(factura: { serie: string | null; folio: string | null; uuid: string | null }, formato: FormatoFactura) {
  const base = [factura.serie ?? "A", factura.folio ?? factura.uuid].filter(Boolean).join("-");
  return `factura-${base}.${formato}`;
}

export async function descargarFactura(
  _orgId: bigint,
  facturaId: bigint,
  formato: FormatoFactura,
): Promise<ArchivoFactura> {
  const factura = await db.factura.findFirst({
    where: { id: facturaId },
    select: {
      id: true,
      estado: true,
      uuid: true,
      serie: true,
      folio: true,
      xml: true,
      pdf: true,
    },
  });
  if (!factura) throw new ErrorCfdi("La factura no existe", 404);
  if (factura.estado !== "timbrada" && factura.estado !== "cancelada") {
    throw new ErrorCfdi("La factura aún no está timbrada", 409);
  }

  if (formato === "xml") {
    if (!factura.xml) {
      throw new ErrorCfdi(
        "La factura no tiene XML guardado; fue timbrada antes de Fase 2A.1 y no se regenera",
        409,
        "archivo_no_disponible",
      );
    }
    return {
      contenido: factura.xml,
      tipoContenido: "application/xml; charset=utf-8",
      nombre: nombreArchivo(factura, "xml"),
    };
  }

  if (!factura.pdf) {
    throw new ErrorCfdi(
      "La factura no tiene PDF guardado; fue timbrada antes de Fase 2A.1 y no se regenera",
      409,
      "archivo_no_disponible",
    );
  }
  return {
    contenido: Buffer.from(factura.pdf),
    tipoContenido: "application/pdf",
    nombre: nombreArchivo(factura, "pdf"),
  };
}
