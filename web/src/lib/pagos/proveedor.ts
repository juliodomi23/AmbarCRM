import { db } from "@/lib/db";
import { ProveedorMercadoPago } from "@/lib/pagos/mercado-pago";
import { ProveedorMock } from "@/lib/pagos/mock";
import type { ProveedorPago } from "@/lib/pagos/tipos";

type ConfigPagos = { proveedor?: unknown; sandbox?: unknown };

export async function obtenerProveedorPago(): Promise<ProveedorPago> {
  const modulo = await db.moduloOrg.findFirst({
    where: { clave: "pagos_en_linea", activo: true },
    select: { config: true },
  });
  const config = (
    modulo?.config && typeof modulo.config === "object" ? modulo.config : {}
  ) as ConfigPagos;
  const clave =
    process.env.PAGOS_PROVEEDOR === "mock" || config.proveedor === "mock"
      ? "mock"
      : "mercado_pago";
  const baseUrl = (
    process.env.PAGOS_BASE_URL ??
    process.env.NEXTAUTH_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
  if (clave === "mock")
    return new ProveedorMock(process.env.PAGOS_MOCK_SECRET ?? "", baseUrl);
  return new ProveedorMercadoPago({
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN ?? "",
    webhookSecret: process.env.MERCADOPAGO_WEBHOOK_SECRET ?? "",
    sandbox: config.sandbox === true,
  });
}
