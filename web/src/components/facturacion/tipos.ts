import type { DecimalSerializado } from "@/lib/retail-calculos";

export type DatosFiscalesVenta = {
  rfc: string;
  razonSocial: string;
  regimenFiscal: string;
  codigoPostal: string;
  usoCfdi: string;
  correo: string | null;
};

export type VentaFacturable = {
  id: string;
  folio: string;
  total: DecimalSerializado;
  moneda: string;
  createdAt: string;
  contacto: {
    id: string;
    nombre: string;
    datosFiscales: DatosFiscalesVenta | null;
  } | null;
};

export type FacturaResumen = {
  id: string;
  serie: string | null;
  folio: string | null;
  uuid: string | null;
  estado: string;
  total: DecimalSerializado;
  moneda: string;
  createdAt: string;
  timbrandoAt: string | null;
  timbradaAt: string | null;
  canceladaAt: string | null;
  error: string | null;
  contacto: { id: string; nombre: string } | null;
  venta: { id: string; folio: string } | null;
  pago: { id: string; referenciaExterna: string | null } | null;
  conceptos: Array<{ id: string }>;
};

export type ConceptoFacturaVista = {
  id: string;
  descripcion: string;
  cantidad: DecimalSerializado;
  valorUnitario: DecimalSerializado;
  importe: DecimalSerializado;
  iva: DecimalSerializado;
  retenciones: DecimalSerializado;
  claveProdServ: string | null;
  claveUnidad: string | null;
};

export type EventoFacturaVista = {
  id: string;
  tipo: string;
  payload: unknown;
  createdAt: string;
};

export type FacturaDetalleVista = Omit<FacturaResumen, "conceptos"> & {
  subtotal: DecimalSerializado;
  impuestos: DecimalSerializado;
  retenciones: DecimalSerializado;
  formaPago: string;
  metodoPago: string;
  usoCfdi: string;
  xmlUrl: string | null;
  pdfUrl: string | null;
  proveedor: string;
  receptorRfc: string | null;
  receptorRazonSocial: string | null;
  receptorRegimenFiscal: string | null;
  receptorCodigoPostal: string | null;
  receptorUsoCfdi: string | null;
  receptorCorreo: string | null;
  emisorRfc: string | null;
  emisorRazonSocial: string | null;
  emisorRegimenFiscal: string | null;
  emisorCodigoPostal: string | null;
  conceptos: ConceptoFacturaVista[];
  contacto: { id: string; nombre: string; email: string | null } | null;
  eventos: EventoFacturaVista[];
};

export type EmisorVista = {
  rfc: string;
  razonSocial: string;
  regimenFiscal: string;
  codigoPostal: string;
  serie: string;
  folioSiguiente: number;
  ambiente: string;
  proveedor: string;
};
