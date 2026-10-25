export const ESTADOS_FACTURA = ["borrador", "timbrando", "timbrada", "cancelada", "error"] as const;
export type EstadoFactura = (typeof ESTADOS_FACTURA)[number];

export const PROVEEDORES_FACTURA = ["mock", "facturama", "sw_sapien"] as const;
export type ProveedorFacturaNombre = (typeof PROVEEDORES_FACTURA)[number];

export const AMBIENTES_CFDI = ["sandbox", "produccion"] as const;
export type AmbienteCfdi = (typeof AMBIENTES_CFDI)[number];

export const FORMATOS_FACTURA = ["xml", "pdf"] as const;
export type FormatoFactura = (typeof FORMATOS_FACTURA)[number];

export type ConceptoEntrada = {
  descripcion: string;
  cantidad: number | string;
  valorUnitario: number | string;
  ivaTasa?: number | string;
  retencionTasa?: number | string;
  claveProdServ?: string;
  claveUnidad?: string;
};

export type ConceptoNormalizado = {
  descripcion: string;
  cantidad: number;
  valorUnitario: number;
  ivaTasa: number;
  retencionTasa: number;
  claveProdServ?: string;
  claveUnidad?: string;
};

export type ConceptoCalculado = ConceptoNormalizado & {
  importe: number;
  iva: number;
  retenciones: number;
};

export type CalculoFactura = {
  conceptos: ConceptoCalculado[];
  subtotal: number;
  impuestos: number;
  retenciones: number;
  total: number;
};

export type DatosFiscalesEntrada = {
  rfc: string;
  razonSocial: string;
  regimenFiscal: string;
  codigoPostal: string;
  usoCfdi: string;
  correo?: string;
};

export type DatosEmisorEntrada = {
  rfc: string;
  razonSocial: string;
  regimenFiscal: string;
  codigoPostal: string;
  serie: string;
  folioSiguiente: number;
  ambiente: AmbienteCfdi;
  proveedor: ProveedorFacturaNombre;
};

export type EntradaFactura = {
  ventaId?: string;
  pagoId?: string;
  contactoId?: string;
  usoCfdi?: string;
  formaPago?: string;
  metodoPago?: string;
  moneda?: string;
  descripcion?: string;
  idempotencyKey?: string;
  timbrar?: boolean;
  conceptos?: ConceptoNormalizado[];
};

export type DatosTimbrado = {
  facturaId: string;
  serie: string;
  folio: string;
  fecha: string;
  emisor: DatosEmisorEntrada;
  receptor: DatosFiscalesEntrada;
  conceptos: ConceptoCalculado[];
  subtotal: number;
  impuestos: number;
  retenciones: number;
  total: number;
  moneda: string;
  formaPago: string;
  metodoPago: string;
  usoCfdi: string;
};

export type ResultadoTimbrado = {
  uuid: string;
  serie: string;
  folio: string;
  estado: "timbrada";
  fechaTimbrado: string;
  xml: string;
  pdf: Uint8Array;
};

export type ConsultaFactura = {
  uuid: string;
  estado: EstadoFactura;
  cancelable: boolean;
  fechaTimbrado?: string;
  fechaCancelacion?: string;
};

export type ResultadoCancelacion = {
  estado: "cancelada";
  fechaCancelacion: string;
};

export type DatosDescarga = {
  uuid: string;
  serie?: string | null;
  folio?: string | null;
  total?: string;
  moneda?: string;
  rfcEmisor?: string;
  nombreEmisor?: string;
  rfcReceptor?: string;
  nombreReceptor?: string;
  fecha?: string;
};

export type ArchivoFactura = {
  contenido: Uint8Array | string;
  tipoContenido: string;
  nombre: string;
};

export interface ProveedorFactura {
  timbrar(datos: DatosTimbrado): Promise<ResultadoTimbrado>;
  consultar(uuid: string): Promise<ConsultaFactura>;
  cancelar(uuid: string, motivo: string): Promise<ResultadoCancelacion>;
  descargar(datos: DatosDescarga, formato: FormatoFactura): Promise<ArchivoFactura>;
}
