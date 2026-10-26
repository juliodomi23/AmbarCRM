import { descifrarCredencialPago } from "@/lib/pagos/credenciales";
import { ProveedorMercadoPago } from "@/lib/pagos/mercado-pago";
import { ProveedorMock } from "@/lib/pagos/mock";
import { ProveedorStripe } from "@/lib/pagos/stripe";
import type { ProveedorPago } from "@/lib/pagos/tipos";

type ClaveProveedor = ProveedorPago["clave"];
type CredencialProveedor = {
  accessTokenEncrypted: string | null;
  sandbox: boolean;
  proveedorUserId: string | null;
};
type ContextoRegistro = { credencial: CredencialProveedor; baseUrl: string };

export const registroProveedoresPago: Record<ClaveProveedor, (contexto: ContextoRegistro) => ProveedorPago> = {
  mercado_pago: ({ credencial }) => {
    const token = credencial.accessTokenEncrypted
      ? descifrarCredencialPago(credencial.accessTokenEncrypted)
      : credencial.proveedorUserId;
    const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim();
    if (!token || !webhookSecret) throw new Error("Mercado Pago requiere volver a conectarse");
    return new ProveedorMercadoPago({ accessToken: token, webhookSecret, sandbox: credencial.sandbox });
  },
  stripe: ({ credencial }) => {
    const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!secretKey || !webhookSecret) throw new Error(`Pagos no configurados: ${!secretKey ? "STRIPE_SECRET_KEY" : "STRIPE_WEBHOOK_SECRET"} sin configurar`);
    if (!credencial.proveedorUserId) throw new Error("Stripe no está conectado para esta organización");
    return new ProveedorStripe({ secretKey, webhookSecret, accountId: credencial.proveedorUserId, sandbox: credencial.sandbox });
  },
  mock: () => {
    if (process.env.NODE_ENV === "production" && process.env.PAGOS_PERMITIR_MOCK !== "1") throw new Error("El proveedor mock está bloqueado en producción");
    const secret = process.env.PAGOS_MOCK_SECRET?.trim();
    if (!secret) throw new Error("Pagos no configurados: PAGOS_MOCK_SECRET sin configurar");
    return new ProveedorMock(secret, process.env.PAGOS_BASE_URL ?? "http://localhost:3000");
  },
};
