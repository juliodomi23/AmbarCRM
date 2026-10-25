import { ErrorCfdi } from "./errores";
import type {
  ArchivoFactura,
  ConsultaFactura,
  DatosDescarga,
  DatosTimbrado,
  FormatoFactura,
  ProveedorFactura,
  ResultadoCancelacion,
  ResultadoTimbrado,
} from "./tipos";

const URL_PREDETERMINADA = "https://apisandbox.facturama.mx";

function credenciales() {
  const usuario = process.env.FACTURAMA_USUARIO;
  const password = process.env.FACTURAMA_PASSWORD;
  if (!usuario || !password) {
    throw new ErrorCfdi("Facturama no está configurado (faltan FACTURAMA_USUARIO/FACTURAMA_PASSWORD)", 409, "pac_no_configurado");
  }
  return { usuario, password };
}

async function pedir<T>(ruta: string, init: RequestInit = {}): Promise<T> {
  const { usuario, password } = credenciales();
  const base = (process.env.FACTURAMA_URL || URL_PREDETERMINADA).replace(/\/$/u, "");
  const respuesta = await fetch(`${base}${ruta}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${usuario}:${password}`).toString("base64")}`,
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!respuesta.ok) {
    throw new ErrorCfdi(`Facturama respondió ${respuesta.status}`, 502, "pac_error");
  }
  return respuesta.json() as Promise<T>;
}

/**
 * Esqueleto del PAC real. En Fase 2A solo se implementa la consulta de estatus;
 * timbrado, cancelación y descargas se completan en Fase 2B con el sandbox.
 */
export class ProveedorFacturama implements ProveedorFactura {
  async timbrar(_datos: DatosTimbrado): Promise<ResultadoTimbrado> {
    throw new ErrorCfdi("El timbrado real con Facturama no está implementado en Fase 2A", 501, "no_implementado");
  }

  async consultar(uuid: string): Promise<ConsultaFactura> {
    const datos = await pedir<{ Id?: string; Status?: string; IsCancelable?: boolean }>(
      `/api/Cfdi/${encodeURIComponent(uuid)}`,
      { method: "GET" },
    );
    const cancelada = String(datos.Status ?? "").toLowerCase().includes("cancel");
    return {
      uuid,
      estado: cancelada ? "cancelada" : "timbrada",
      cancelable: Boolean(datos.IsCancelable) && !cancelada,
    };
  }

  async cancelar(_uuid: string, _motivo: string): Promise<ResultadoCancelacion> {
    throw new ErrorCfdi("La cancelación real con Facturama no está implementada en Fase 2A", 501, "no_implementado");
  }

  async descargar(_datos: DatosDescarga, _formato: FormatoFactura): Promise<ArchivoFactura> {
    throw new ErrorCfdi("La descarga real con Facturama no está implementada en Fase 2A", 501, "no_implementado");
  }
}
