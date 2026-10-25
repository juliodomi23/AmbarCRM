import { ErrorCfdi } from "./errores";
import { ProveedorFacturama } from "./facturama";
import { ProveedorMock } from "./mock";
import type { ProveedorFactura } from "./tipos";

export function mockFacturaPermitido() {
  return process.env.NODE_ENV !== "production" || process.env.CFDI_PERMITIR_MOCK === "1";
}

/** Selecciona el PAC por configuración del emisor o por entorno. */
export function obtenerProveedorFactura(opciones: { proveedor?: string | null } = {}): ProveedorFactura {
  const proveedor = (opciones.proveedor || process.env.CFDI_PROVEEDOR || "mock").toLowerCase();
  if (proveedor === "mock") {
    if (!mockFacturaPermitido()) {
      throw new ErrorCfdi("El proveedor mock está bloqueado en producción", 409, "mock_bloqueado");
    }
    return new ProveedorMock();
  }
  if (proveedor === "facturama") return new ProveedorFacturama();
  if (proveedor === "sw_sapien") {
    throw new ErrorCfdi("SW Sapien aún no tiene adaptador implementado", 501, "no_implementado");
  }
  throw new ErrorCfdi(`Proveedor de facturación no soportado: ${proveedor}`, 400, "proveedor_invalido");
}
