import { db } from "@/lib/db";
import { ProveedorMercadoPago } from "@/lib/pagos/mercado-pago";
import { ProveedorMock } from "@/lib/pagos/mock";
import type { ProveedorPago } from "@/lib/pagos/tipos";
import { descifrarCredencialPago } from "@/lib/pagos/credenciales";
import { renovarCredencialMercadoPago } from "@/lib/pagos/oauth";

export class ErrorConfiguracionPagos extends Error {
  readonly status = 409;
}

export function mockPagosPermitido() {
  return process.env.NODE_ENV !== "production" || process.env.PAGOS_PERMITIR_MOCK === "1";
}

function baseUrl() {
  return (process.env.PAGOS_BASE_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export async function obtenerProveedorPago(orgId: bigint): Promise<ProveedorPago> {
  let credencial = await db.credencialPago.findFirst({
    where: { activo: true },
    orderBy: { updatedAt: "desc" },
  });

  if (credencial) {
    if (credencial.proveedor === "mock") {
      if (!mockPagosPermitido())
        throw new ErrorConfiguracionPagos("El proveedor mock está bloqueado en producción");
      return new ProveedorMock(
        process.env.PAGOS_MOCK_SECRET ?? "",
        baseUrl(),
      );
    }
    if (credencial.requiereReconexion || !credencial.accessTokenEncrypted)
      throw new ErrorConfiguracionPagos(
        "Mercado Pago requiere volver a conectarse",
      );
    const renovarAntesDe = new Date(Date.now() + 7 * 24 * 60 * 60_000);
    if (credencial.expiresAt && credencial.expiresAt <= renovarAntesDe) {
      try {
        credencial = await renovarCredencialMercadoPago(orgId, credencial);
      } catch {
        throw new ErrorConfiguracionPagos(
          "Mercado Pago requiere volver a conectarse",
        );
      }
    }
    const accessTokenEncrypted = credencial.accessTokenEncrypted;
    if (!accessTokenEncrypted)
      throw new ErrorConfiguracionPagos("Mercado Pago requiere volver a conectarse");
    return new ProveedorMercadoPago({
      accessToken: descifrarCredencialPago(accessTokenEncrypted),
      webhookSecret: process.env.MERCADOPAGO_WEBHOOK_SECRET ?? "",
      sandbox: credencial.sandbox,
    });
  }

  if (String(orgId) !== process.env.PAGOS_ORG_PILOTO?.trim())
    throw new ErrorConfiguracionPagos("Pagos no configurados para esta organización");

  const clave = process.env.PAGOS_PROVEEDOR === "mock" ? "mock" : "mercado_pago";
  if (clave === "mock") {
    if (!mockPagosPermitido())
      throw new ErrorConfiguracionPagos("El proveedor mock está bloqueado en producción");
    const secreto = process.env.PAGOS_MOCK_SECRET ?? "";
    if (!secreto) throw new ErrorConfiguracionPagos("Pagos no configurados para esta organización");
    return new ProveedorMock(secreto, baseUrl());
  }
  if (!process.env.MERCADOPAGO_ACCESS_TOKEN || !process.env.MERCADOPAGO_WEBHOOK_SECRET)
    throw new ErrorConfiguracionPagos("Pagos no configurados para esta organización");
  return new ProveedorMercadoPago({
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
    webhookSecret: process.env.MERCADOPAGO_WEBHOOK_SECRET,
    sandbox: process.env.MERCADOPAGO_SANDBOX !== "0",
  });
}
