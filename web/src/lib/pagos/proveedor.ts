import { db } from "@/lib/db";
import { registroProveedoresPago } from "@/lib/pagos/registro";
import type { ProveedorPago } from "@/lib/pagos/tipos";
import { validarLlaveCifradoPagos } from "@/lib/pagos/credenciales";
import {
  configuracionOAuth,
  renovarCredencialMercadoPago,
} from "@/lib/pagos/oauth";

export class ErrorConfiguracionPagos extends Error {
  readonly status = 409;
}

export function mockPagosPermitido() {
  return process.env.NODE_ENV !== "production" || process.env.PAGOS_PERMITIR_MOCK === "1";
}

function errorConfiguracion(detalle: string) {
  const mensaje = detalle.startsWith("Pagos no configurados:")
    ? detalle
    : `Pagos no configurados: ${detalle}`;
  return new ErrorConfiguracionPagos(mensaje);
}

export function validarConfiguracionPagosAplicacion() {
  try {
    validarLlaveCifradoPagos();
  } catch (error) {
    throw errorConfiguracion(
      error instanceof Error ? error.message : "OAuth no disponible",
    );
  }
  return {
    mercado_pago: !process.env.MERCADOPAGO_CLIENT_ID?.trim() || !process.env.MERCADOPAGO_CLIENT_SECRET?.trim() || !process.env.MERCADOPAGO_REDIRECT_URI?.trim() || !process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim()
      ? "Faltan variables de configuración de Mercado Pago"
      : null,
    stripe: !process.env.STRIPE_SECRET_KEY?.trim() || !process.env.STRIPE_WEBHOOK_SECRET?.trim()
      ? `Faltan variables de configuración de Stripe${!process.env.STRIPE_SECRET_KEY?.trim() ? ": STRIPE_SECRET_KEY" : ": STRIPE_WEBHOOK_SECRET"}`
      : null,
  };
}

function baseUrl() {
  return (process.env.PAGOS_BASE_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export async function obtenerProveedorPago(
  orgId: bigint,
  proveedorSolicitado?: ProveedorPago["clave"],
  opciones: { webhook?: boolean } = {},
): Promise<ProveedorPago> {
  const modulo = await db.moduloOrg.findFirst({ where: { clave: "pagos_en_linea", activo: true }, select: { config: true } });
  const config = modulo?.config && typeof modulo.config === "object" && !Array.isArray(modulo.config) ? modulo.config as Record<string, unknown> : {};
  const valorProveedor = proveedorSolicitado ?? config.proveedor ?? (process.env.PAGOS_PROVEEDOR === "mock" ? "mock" : "mercado_pago");
  if (typeof valorProveedor !== "string" || !Object.hasOwn(registroProveedoresPago, valorProveedor)) throw new ErrorConfiguracionPagos("El proveedor predeterminado de pagos es inválido");
  const proveedor = valorProveedor as ProveedorPago["clave"];
  let credencial = await db.credencialPago.findUnique({ where: { orgId_proveedor: { orgId, proveedor } } });

  if (!credencial && proveedor !== "mock" && String(orgId) === process.env.PAGOS_ORG_PILOTO?.trim() && proveedor === "mercado_pago" && process.env.MERCADOPAGO_ACCESS_TOKEN) {
    const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim();
    if (!secret) throw errorConfiguracion("MERCADOPAGO_WEBHOOK_SECRET sin configurar");
    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    return registroProveedoresPago.mercado_pago({ credencial: { accessTokenEncrypted: null, sandbox: process.env.MERCADOPAGO_SANDBOX !== "0", proveedorUserId: token }, baseUrl: baseUrl() }) as ProveedorPago;
  }

  if (proveedor === "mock" && !mockPagosPermitido()) throw new ErrorConfiguracionPagos("El proveedor mock está bloqueado en producción");
  if (!credencial?.activo && proveedor !== "mock") throw new ErrorConfiguracionPagos("Pagos no configurados para esta organización");

  if (proveedor === "mercado_pago") {
    if (!credencial || credencial.requiereReconexion || !credencial.accessTokenEncrypted) throw new ErrorConfiguracionPagos("Mercado Pago requiere volver a conectarse");
    try { validarLlaveCifradoPagos(); } catch (error) { throw errorConfiguracion(error instanceof Error ? error.message : "clave de cifrado inválida"); }
    const renovarAntesDe = new Date(Date.now() + 7 * 24 * 60 * 60_000);
    if (credencial.expiresAt && credencial.expiresAt <= renovarAntesDe) {
      try { credencial = await renovarCredencialMercadoPago(orgId, credencial); }
      catch { throw new ErrorConfiguracionPagos("Mercado Pago requiere volver a conectarse"); }
    }
  }
  if (proveedor === "stripe") {
    const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
    if (!secretKey) throw errorConfiguracion("STRIPE_SECRET_KEY sin configurar");
    if (!credencial?.proveedorUserId || (credencial.requiereReconexion && !opciones.webhook)) throw new ErrorConfiguracionPagos("Stripe requiere continuar o restablecer la conexión");
    const sandbox = secretKey.startsWith("sk_test_");
    if (!secretKey.startsWith("sk_test_") && !secretKey.startsWith("sk_live_")) throw errorConfiguracion("STRIPE_SECRET_KEY debe empezar con sk_test_ o sk_live_");
    if (credencial.sandbox !== sandbox) throw new ErrorConfiguracionPagos("La cuenta de Stripe fue conectada en otro modo; vuelve a conectarla con la llave correspondiente");
    if (!opciones.webhook && !credencial.stripeChargesEnabled) throw new ErrorConfiguracionPagos("Falta completar datos en Stripe");
  }
  try {
    const factory = registroProveedoresPago[proveedor];
    return factory({ credencial: credencial ?? { accessTokenEncrypted: null, sandbox: true, proveedorUserId: null }, baseUrl: baseUrl() });
  } catch (error) {
    if (error instanceof ErrorConfiguracionPagos) throw error;
    throw errorConfiguracion(error instanceof Error ? error.message : "proveedor de pagos inválido");
  }
}
