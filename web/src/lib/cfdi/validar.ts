import type {
  AmbienteCfdi,
  ConceptoEntrada,
  ConceptoNormalizado,
  DatosEmisorEntrada,
  DatosFiscalesEntrada,
  EntradaFactura,
  ProveedorFacturaNombre,
} from "./tipos";

export type Validacion<T> =
  | { ok: true; valor: T }
  | { ok: false; error: string };

const ok = <T>(valor: T): Validacion<T> => ({ ok: true, valor });
const fallo = (error: string): Validacion<never> => ({ ok: false, error });

export const REGIMENES_FISCALES = [
  "601", "603", "605", "606", "607", "608", "609", "610", "611", "612",
  "614", "615", "616", "620", "621", "622", "623", "624", "625", "626",
] as const;

export const USOS_CFDI = [
  "G01", "G02", "G03", "D01", "D02", "D03", "D04", "D05", "D06", "D07",
  "D08", "D09", "D10", "P01", "S01", "CP01", "CN01",
] as const;

export const FORMAS_PAGO = [
  "01", "02", "03", "04", "05", "06", "08", "12", "13", "14", "15", "17",
  "23", "24", "25", "26", "27", "28", "29", "30", "31", "99",
] as const;

export const METODOS_PAGO = ["PUE", "PPD"] as const;
export const MONEDAS = ["MXN"] as const;

const RFC_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/u;
const CORREO_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function texto(valor: unknown) {
  return typeof valor === "string" ? valor.trim() : "";
}

function numero(valor: unknown) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor === "string" && valor.trim() !== "") {
    const convertido = Number(valor.trim());
    return Number.isFinite(convertido) ? convertido : null;
  }
  return null;
}

function sinControl(valor: string) {
  return !/[\u0000-\u001f\u007f-\u009f]/u.test(valor);
}

function idOpcional(valor: unknown, campo: string): Validacion<string | undefined> {
  if (valor === undefined || valor === null || valor === "") return ok(undefined);
  if (typeof valor === "bigint") {
    return valor > 0n ? ok(valor.toString()) : fallo(`${campo} inválido`);
  }
  if (typeof valor === "number") {
    return Number.isInteger(valor) && valor > 0 ? ok(String(valor)) : fallo(`${campo} inválido`);
  }
  if (typeof valor === "string" && /^\d+$/u.test(valor.trim())) {
    return ok(valor.trim());
  }
  return fallo(`${campo} inválido`);
}

function opcion<T extends string>(
  valor: unknown,
  opciones: readonly T[],
  campo: string,
): Validacion<T | undefined> {
  if (valor === undefined || valor === null || valor === "") return ok(undefined);
  const limpio = texto(valor).toUpperCase();
  return opciones.includes(limpio as T)
    ? ok(limpio as T)
    : fallo(`${campo} inválido`);
}

export function validarRfc(valor: unknown): Validacion<string> {
  const rfc = texto(valor).toUpperCase();
  if (!rfc) return fallo("el RFC es obligatorio");
  if (rfc.length < 12 || rfc.length > 13) return fallo("el RFC debe tener 12 o 13 caracteres");
  if (!RFC_REGEX.test(rfc)) return fallo("el RFC no tiene un formato válido");
  return ok(rfc);
}

export function validarRazonSocial(valor: unknown): Validacion<string> {
  const razon = texto(valor).replace(/\s+/gu, " ");
  if (!razon) return fallo("la razón social es obligatoria");
  if (razon.length < 2 || razon.length > 254) return fallo("la razón social debe tener entre 2 y 254 caracteres");
  if (!sinControl(razon)) return fallo("la razón social contiene caracteres inválidos");
  return ok(razon);
}

export function validarRegimenFiscal(valor: unknown): Validacion<string> {
  const regimen = texto(valor);
  return REGIMENES_FISCALES.includes(regimen as (typeof REGIMENES_FISCALES)[number])
    ? ok(regimen)
    : fallo("el régimen fiscal no es válido");
}

export function validarUsoCfdi(valor: unknown): Validacion<string> {
  const uso = texto(valor).toUpperCase();
  return USOS_CFDI.includes(uso as (typeof USOS_CFDI)[number])
    ? ok(uso)
    : fallo("el uso de CFDI no es válido");
}

export function validarCodigoPostal(valor: unknown): Validacion<string> {
  const cp = texto(valor);
  return /^\d{5}$/u.test(cp) ? ok(cp) : fallo("el código postal debe tener 5 dígitos");
}

export function validarFormaPago(valor: unknown): Validacion<string> {
  const forma = texto(valor);
  return FORMAS_PAGO.includes(forma as (typeof FORMAS_PAGO)[number])
    ? ok(forma)
    : fallo("la forma de pago no es válida");
}

export function validarMetodoPago(valor: unknown): Validacion<string> {
  const metodo = texto(valor).toUpperCase();
  return METODOS_PAGO.includes(metodo as (typeof METODOS_PAGO)[number])
    ? ok(metodo)
    : fallo("el método de pago no es válido");
}

export function validarMoneda(valor: unknown): Validacion<string> {
  const moneda = texto(valor).toUpperCase();
  return MONEDAS.includes(moneda as (typeof MONEDAS)[number])
    ? ok(moneda)
    : fallo("la moneda no es válida (solo MXN en Fase 2A)");
}

export function validarCorreo(valor: unknown): Validacion<string | undefined> {
  if (valor === undefined || valor === null || valor === "") return ok(undefined);
  const correo = texto(valor).toLowerCase();
  if (correo.length > 254 || !CORREO_REGEX.test(correo)) return fallo("el correo no es válido");
  return ok(correo);
}

export function validarCantidad(valor: unknown): Validacion<number> {
  const cantidad = numero(valor);
  if (cantidad === null) return fallo("la cantidad es obligatoria");
  if (cantidad <= 0) return fallo("la cantidad debe ser mayor que cero");
  if (cantidad > 1_000_000) return fallo("la cantidad excede el máximo permitido");
  const escalado = cantidad * 1000;
  if (Math.abs(escalado - Math.round(escalado)) > 1e-6) {
    return fallo("la cantidad admite máximo 3 decimales");
  }
  return ok(Math.round(escalado) / 1000);
}

export function validarValorUnitario(valor: unknown): Validacion<number> {
  const unitario = numero(valor);
  if (unitario === null) return fallo("el valor unitario es obligatorio");
  if (unitario < 0) return fallo("el valor unitario no puede ser negativo");
  if (unitario > 10_000_000) return fallo("el valor unitario excede el máximo permitido");
  const centavos = unitario * 100;
  if (Math.abs(centavos - Math.round(centavos)) > 1e-6) {
    return fallo("el valor unitario admite máximo 2 decimales");
  }
  return ok(Math.round(centavos) / 100);
}

export function validarTasa(valor: unknown, campo: string, predeterminada: number): Validacion<number> {
  if (valor === undefined || valor === null || valor === "") return ok(predeterminada);
  const tasa = numero(valor);
  if (tasa === null || tasa < 0 || tasa > 1) return fallo(`${campo} debe estar entre 0 y 1`);
  const escalado = tasa * 10_000;
  if (Math.abs(escalado - Math.round(escalado)) > 1e-6) {
    return fallo(`${campo} admite máximo 4 decimales`);
  }
  return ok(Math.round(escalado) / 10_000);
}

export function validarConcepto(valor: unknown): Validacion<ConceptoNormalizado> {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) {
    return fallo("el concepto no es válido");
  }
  const concepto = valor as ConceptoEntrada;
  const descripcion = texto(concepto.descripcion).replace(/\s+/gu, " ");
  if (!descripcion) return fallo("la descripción del concepto es obligatoria");
  if (descripcion.length > 300) return fallo("la descripción del concepto excede 300 caracteres");
  if (!sinControl(descripcion)) return fallo("la descripción del concepto contiene caracteres inválidos");

  const cantidad = validarCantidad(concepto.cantidad);
  if (!cantidad.ok) return cantidad;
  const valorUnitario = validarValorUnitario(concepto.valorUnitario);
  if (!valorUnitario.ok) return valorUnitario;
  const ivaTasa = validarTasa(concepto.ivaTasa, "la tasa de IVA", 0.16);
  if (!ivaTasa.ok) return ivaTasa;
  const retencionTasa = validarTasa(concepto.retencionTasa, "la tasa de retención", 0);
  if (!retencionTasa.ok) return retencionTasa;

  const claveProdServ = texto(concepto.claveProdServ);
  if (claveProdServ && !/^\d{8}$/u.test(claveProdServ)) {
    return fallo("la clave de producto/servicio debe tener 8 dígitos");
  }
  const claveUnidad = texto(concepto.claveUnidad).toUpperCase();
  if (claveUnidad && !/^[A-Z0-9]{2,3}$/u.test(claveUnidad)) {
    return fallo("la clave de unidad no es válida");
  }

  return ok({
    descripcion,
    cantidad: cantidad.valor,
    valorUnitario: valorUnitario.valor,
    ivaTasa: ivaTasa.valor,
    retencionTasa: retencionTasa.valor,
    ...(claveProdServ ? { claveProdServ } : {}),
    ...(claveUnidad ? { claveUnidad } : {}),
  });
}

export function validarConceptos(valor: unknown): Validacion<ConceptoNormalizado[]> {
  if (!Array.isArray(valor) || valor.length === 0) return fallo("agrega al menos un concepto");
  if (valor.length > 100) return fallo("no se permiten más de 100 conceptos");
  const conceptos: ConceptoNormalizado[] = [];
  for (const item of valor) {
    const validado = validarConcepto(item);
    if (!validado.ok) return validado;
    conceptos.push(validado.valor);
  }
  return ok(conceptos);
}

export function validarDatosFiscales(valor: unknown): Validacion<DatosFiscalesEntrada> {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) {
    return fallo("los datos fiscales no son válidos");
  }
  const datos = valor as Record<string, unknown>;
  const rfc = validarRfc(datos.rfc);
  if (!rfc.ok) return rfc;
  const razonSocial = validarRazonSocial(datos.razonSocial);
  if (!razonSocial.ok) return razonSocial;
  const regimenFiscal = validarRegimenFiscal(datos.regimenFiscal);
  if (!regimenFiscal.ok) return regimenFiscal;
  const codigoPostal = validarCodigoPostal(datos.codigoPostal);
  if (!codigoPostal.ok) return codigoPostal;
  const usoCfdi = validarUsoCfdi(datos.usoCfdi);
  if (!usoCfdi.ok) return usoCfdi;
  const correo = validarCorreo(datos.correo);
  if (!correo.ok) return correo;

  return ok({
    rfc: rfc.valor,
    razonSocial: razonSocial.valor,
    regimenFiscal: regimenFiscal.valor,
    codigoPostal: codigoPostal.valor,
    usoCfdi: usoCfdi.valor,
    ...(correo.valor ? { correo: correo.valor } : {}),
  });
}

export function validarDatosEmisor(valor: unknown): Validacion<DatosEmisorEntrada> {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) {
    return fallo("los datos del emisor no son válidos");
  }
  const datos = valor as Record<string, unknown>;
  const rfc = validarRfc(datos.rfc);
  if (!rfc.ok) return rfc;
  const razonSocial = validarRazonSocial(datos.razonSocial);
  if (!razonSocial.ok) return razonSocial;
  const regimenFiscal = validarRegimenFiscal(datos.regimenFiscal);
  if (!regimenFiscal.ok) return regimenFiscal;
  const codigoPostal = validarCodigoPostal(datos.codigoPostal);
  if (!codigoPostal.ok) return codigoPostal;

  const serie = texto(datos.serie).toUpperCase();
  if (!/^[A-Z0-9-]{1,10}$/u.test(serie)) return fallo("la serie debe tener de 1 a 10 caracteres alfanuméricos");

  const folioSiguiente = numero(datos.folioSiguiente);
  if (folioSiguiente === null || !Number.isInteger(folioSiguiente) || folioSiguiente < 1 || folioSiguiente > 999_999_999) {
    return fallo("el folio siguiente debe ser un entero positivo");
  }

  const ambiente = texto(datos.ambiente).toLowerCase();
  if (ambiente !== "sandbox" && ambiente !== "produccion") {
    return fallo("el ambiente debe ser sandbox o produccion");
  }

  const proveedor = texto(datos.proveedor).toLowerCase();
  if (proveedor !== "mock" && proveedor !== "facturama" && proveedor !== "sw_sapien") {
    return fallo("el proveedor de facturación no es válido");
  }

  return ok({
    rfc: rfc.valor,
    razonSocial: razonSocial.valor,
    regimenFiscal: regimenFiscal.valor,
    codigoPostal: codigoPostal.valor,
    serie,
    folioSiguiente,
    ambiente: ambiente as AmbienteCfdi,
    proveedor: proveedor as ProveedorFacturaNombre,
  });
}

export function validarMotivoCancelacion(valor: unknown): Validacion<string> {
  const motivo = texto(valor).replace(/\s+/gu, " ");
  if (!motivo) return fallo("el motivo de cancelación es obligatorio");
  if (motivo.length > 200) return fallo("el motivo de cancelación excede 200 caracteres");
  if (!sinControl(motivo)) return fallo("el motivo de cancelación contiene caracteres inválidos");
  return ok(motivo);
}

export function validarEntradaFactura(valor: unknown): Validacion<EntradaFactura> {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) {
    return fallo("la solicitud de factura no es válida");
  }
  const datos = valor as Record<string, unknown>;
  const ventaId = idOpcional(datos.ventaId, "la venta");
  if (!ventaId.ok) return ventaId;
  const pagoId = idOpcional(datos.pagoId, "el pago");
  if (!pagoId.ok) return pagoId;
  const contactoId = idOpcional(datos.contactoId, "el contacto");
  if (!contactoId.ok) return contactoId;

  if (!ventaId.valor && !pagoId.valor) return fallo("indica una venta o un pago");
  if (ventaId.valor && pagoId.valor) return fallo("indica solo una venta o un pago");

  const usoCfdi = opcion(datos.usoCfdi, USOS_CFDI, "el uso de CFDI");
  if (!usoCfdi.ok) return usoCfdi;
  const formaPago = opcion(datos.formaPago, FORMAS_PAGO, "la forma de pago");
  if (!formaPago.ok) return formaPago;
  const metodoPago = opcion(datos.metodoPago, METODOS_PAGO, "el método de pago");
  if (!metodoPago.ok) return metodoPago;
  const moneda = opcion(datos.moneda, MONEDAS, "la moneda");
  if (!moneda.ok) return moneda;

  const descripcion = texto(datos.descripcion).replace(/\s+/gu, " ");
  if (descripcion && (descripcion.length > 300 || !sinControl(descripcion))) {
    return fallo("la descripción no es válida");
  }

  const idempotencyKey = texto(datos.idempotencyKey);
  if (idempotencyKey && !/^[A-Za-z0-9._:-]{8,120}$/u.test(idempotencyKey)) {
    return fallo("la clave de idempotencia no es válida");
  }

  let timbrar = false;
  if (datos.timbrar === true || datos.timbrar === "1" || datos.timbrar === "true") timbrar = true;
  else if (datos.timbrar === false || datos.timbrar === "0" || datos.timbrar === "false" || datos.timbrar === undefined) timbrar = false;
  else return fallo("el campo timbrar no es válido");

  let conceptos: ConceptoNormalizado[] | undefined;
  if (datos.conceptos !== undefined) {
    const validados = validarConceptos(datos.conceptos);
    if (!validados.ok) return validados;
    conceptos = validados.valor;
  }

  return ok({
    ...(ventaId.valor ? { ventaId: ventaId.valor } : {}),
    ...(pagoId.valor ? { pagoId: pagoId.valor } : {}),
    ...(contactoId.valor ? { contactoId: contactoId.valor } : {}),
    ...(usoCfdi.valor ? { usoCfdi: usoCfdi.valor } : {}),
    ...(formaPago.valor ? { formaPago: formaPago.valor } : {}),
    ...(metodoPago.valor ? { metodoPago: metodoPago.valor } : {}),
    ...(moneda.valor ? { moneda: moneda.valor } : {}),
    ...(descripcion ? { descripcion } : {}),
    ...(idempotencyKey ? { idempotencyKey } : {}),
    ...(conceptos ? { conceptos } : {}),
    timbrar,
  });
}
