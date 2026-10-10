import { claveIdentidad, type Almacen } from "@/lib/caja-offline/almacen";
import type { IdentidadCaja } from "@/lib/caja-offline/catalogo";

export type EstadoCola = "pendiente" | "esperando_turno" | "error";

export type VentaEnCola = {
  uuidCliente: string;
  folio: string;
  identidad: IdentidadCaja;
  turnoId: string;
  /** Instante real de la venta (reloj de la caja), ISO. */
  vendidaAt: string;
  partidas: Array<{ productoId: string; nombre: string; cantidad: string; descuento: string; precioUnitario: string; total: string }>;
  pagos: Array<{ metodo: "efectivo" | "tarjeta" | "transferencia"; monto: string }>;
  descuento: string;
  totalCobrado: string;
  cambio: string;
  catalogoVersion: string | null;
  estado: EstadoCola;
  intentos: number;
  proximoIntentoAt: string | null;
  ultimoError: string | null;
  codigo: string | null;
};

export type ResultadoSubida = {
  estado: "vacia" | "completa" | "sesion" | "apagado" | "reintento";
  subidas: number;
  errores: number;
  esperando: number;
};

export const folioSinRed = (uuid: string) => `SR-${uuid.replaceAll("-", "").slice(0, 10).toUpperCase()}`;
export const claveCola = (venta: Pick<VentaEnCola, "identidad" | "vendidaAt" | "uuidCliente">) =>
  `${claveIdentidad(venta.identidad)}:${venta.vendidaAt}:${venta.uuidCliente}`;

const ESPERA_TURNO_MS = 30_000;
const ESPERA_MAXIMA_MS = 300_000;

/** 5 s, 15 s, 45 s… con tope de 5 min y ±20 % de variación para que varias cajas no suban a la vez. */
export function esperaReintento(intentos: number, azar: () => number = Math.random) {
  const base = Math.min(ESPERA_MAXIMA_MS, 5_000 * 3 ** Math.max(0, intentos - 1));
  return Math.round(base * (0.8 + azar() * 0.4));
}

export async function encolarVenta(almacen: Almacen, venta: VentaEnCola) {
  await almacen.guardar("cola", claveCola(venta), venta);
}

/** Solo las de esta identidad, en orden de venta. */
export function listarCola(almacen: Almacen, identidad: IdentidadCaja) {
  return almacen.listar<VentaEnCola>("cola", `${claveIdentidad(identidad)}:`);
}

export async function descartarVenta(almacen: Almacen, venta: VentaEnCola) {
  await almacen.borrar("cola", claveCola(venta));
}

export async function reintentarVenta(almacen: Almacen, venta: VentaEnCola) {
  await almacen.guardar("cola", claveCola(venta), { ...venta, estado: "pendiente", proximoIntentoAt: null, ultimoError: null, codigo: null });
}

function cuerpoDeSubida(venta: VentaEnCola) {
  return {
    orgId: venta.identidad.orgId,
    userId: venta.identidad.userId,
    turnoId: venta.turnoId,
    uuidCliente: venta.uuidCliente,
    folio: venta.folio,
    vendidaAt: venta.vendidaAt,
    totalCobrado: venta.totalCobrado,
    descuento: venta.descuento,
    catalogoVersion: venta.catalogoVersion,
    partidas: venta.partidas.map((partida) => ({ productoId: partida.productoId, cantidad: partida.cantidad, descuento: partida.descuento })),
    pagos: venta.pagos,
  };
}

/**
 * Sube la cola de esta identidad en orden. 5xx / sin red / 408 / 429: espera con retroceso y se detiene (conserva
 * el orden). 401: se detiene y conserva todo (hay que iniciar sesión). 409 TURNO_REQUERIDO: queda esperando turno
 * y no frena a las demás. Otro 4xx: marca error visible y sigue con la siguiente; nunca se reintenta solo.
 */
export async function subirCola(
  almacen: Almacen,
  identidad: IdentidadCaja,
  opciones: { buscar?: typeof fetch; ahora?: () => Date; azar?: () => number } = {},
): Promise<ResultadoSubida> {
  const buscar = opciones.buscar ?? fetch;
  const ahora = opciones.ahora ?? (() => new Date());
  const resultado: ResultadoSubida = { estado: "vacia", subidas: 0, errores: 0, esperando: 0 };
  const pendientes = (await listarCola(almacen, identidad)).filter((venta) => venta.estado !== "error");
  if (pendientes.length === 0) return resultado;
  resultado.estado = "completa";

  for (const venta of pendientes) {
    if (venta.proximoIntentoAt && new Date(venta.proximoIntentoAt) > ahora()) {
      if (venta.estado === "esperando_turno") { resultado.esperando++; continue; }
      resultado.estado = "reintento";
      return resultado;
    }
    let respuesta: Response;
    try {
      respuesta = await buscar("/api/caja/ventas/sin-red", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpoDeSubida(venta)),
      });
    } catch {
      await almacen.guardar("cola", claveCola(venta), {
        ...venta, intentos: venta.intentos + 1, ultimoError: "Sin conexión",
        proximoIntentoAt: new Date(ahora().getTime() + esperaReintento(venta.intentos + 1, opciones.azar)).toISOString(),
      });
      resultado.estado = "reintento";
      return resultado;
    }
    const cuerpo = await respuesta.json().catch(() => ({}));
    const codigo = typeof cuerpo.codigo === "string" ? cuerpo.codigo : null;
    if (respuesta.ok) {
      await descartarVenta(almacen, venta);
      resultado.subidas++;
    } else if (respuesta.status === 401) {
      resultado.estado = "sesion";
      return resultado;
    } else if (respuesta.status === 403 && codigo === "SIN_RED_APAGADO") {
      resultado.estado = "apagado";
      return resultado;
    } else if (respuesta.status === 403 && codigo === "IDENTIDAD_DISTINTA") {
      continue; // no es de esta sesión: se queda intacta para su dueño
    } else if (respuesta.status === 409 && codigo === "TURNO_REQUERIDO") {
      await almacen.guardar("cola", claveCola(venta), {
        ...venta, estado: "esperando_turno", ultimoError: "Abre turno para subir esta venta", codigo,
        proximoIntentoAt: new Date(ahora().getTime() + ESPERA_TURNO_MS).toISOString(),
      });
      resultado.esperando++;
    } else if (respuesta.status >= 500 || respuesta.status === 408 || respuesta.status === 429) {
      await almacen.guardar("cola", claveCola(venta), {
        ...venta, intentos: venta.intentos + 1, ultimoError: `Servidor no disponible (${respuesta.status})`,
        proximoIntentoAt: new Date(ahora().getTime() + esperaReintento(venta.intentos + 1, opciones.azar)).toISOString(),
      });
      resultado.estado = "reintento";
      return resultado;
    } else {
      await almacen.guardar("cola", claveCola(venta), {
        ...venta, estado: "error", ultimoError: String(cuerpo.error ?? `Rechazada (${respuesta.status})`), codigo, proximoIntentoAt: null,
      });
      resultado.errores++;
    }
  }
  return resultado;
}
