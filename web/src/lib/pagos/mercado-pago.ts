import type {
  DatosCheckout,
  EstadoPago,
  EventoPagoProveedor,
  ProveedorPago,
  ResultadoReembolso,
} from "@/lib/pagos/tipos";
import { verificarFirmaMercadoPago } from "@/lib/pagos/firmas";

type Config = { accessToken: string; webhookSecret: string; sandbox: boolean };

type PagoMp = {
  id?: string | number;
  status?: string;
  external_reference?: string;
  transaction_amount?: number;
  transaction_amount_refunded?: number;
  currency_id?: string;
  status_detail?: string;
};

function estadoMercadoPago(estado?: string): EstadoPago {
  if (estado === "approved") return "aprobado";
  if (estado === "rejected") return "rechazado";
  if (estado === "cancelled") return "cancelado";
  if (estado === "refunded") return "reembolsado";
  return "pendiente";
}

function normalizarPago(pago: PagoMp) {
  const monto = Number(pago.transaction_amount ?? 0);
  const montoReembolsado = Number(pago.transaction_amount_refunded ?? 0);
  const contracargo = pago.status === "charged_back";
  const estado = contracargo
    ? "aprobado"
    : pago.status === "refunded" && montoReembolsado < monto
      ? "aprobado"
      : estadoMercadoPago(pago.status);
  return {
    pagoId: String(pago.external_reference ?? ""),
    referencia: String(pago.id ?? ""),
    estado,
    monto: monto.toFixed(2),
    moneda: String(pago.currency_id ?? ""),
    montoReembolsado: montoReembolsado.toFixed(2),
    contracargo,
    payload: {
      paymentId: String(pago.id ?? ""),
      status: String(pago.status ?? ""),
      statusDetail: String(pago.status_detail ?? ""),
    },
  };
}

export class ProveedorMercadoPago implements ProveedorPago {
  readonly clave = "mercado_pago" as const;

  constructor(private readonly config: Config) {
    if (!config.accessToken || !config.webhookSecret) {
      throw new Error("Mercado Pago no está configurado");
    }
  }

  private async solicitar<T>(ruta: string, init: RequestInit = {}) {
    const respuesta = await fetch(`https://api.mercadopago.com${ruta}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const datos = (await respuesta.json().catch(() => ({}))) as T & {
      message?: string;
    };
    if (!respuesta.ok)
      throw new Error(
        `Mercado Pago rechazó la operación (${respuesta.status}): ${datos.message ?? "sin detalle"}`,
      );
    return datos;
  }

  async crearCheckout(datos: DatosCheckout) {
    const respuesta = await this.solicitar<{
      id: string;
      init_point: string;
      sandbox_init_point?: string;
    }>("/checkout/preferences", {
      method: "POST",
      headers: { "X-Idempotency-Key": datos.idempotencyKey },
      body: JSON.stringify({
        items: [
          {
            id: datos.pagoId,
            title: datos.titulo,
            quantity: 1,
            currency_id: datos.moneda,
            unit_price: Number(datos.monto),
          },
        ],
        external_reference: datos.pagoId,
        notification_url: datos.urlWebhook,
        back_urls: {
          success: `${datos.urlResultado}?estado=exito`,
          pending: `${datos.urlResultado}?estado=pendiente`,
          failure: `${datos.urlResultado}?estado=error`,
        },
        auto_return: "approved",
        expires: true,
        expiration_date_to: datos.expiraAt.toISOString(),
      }),
    });
    return {
      url:
        this.config.sandbox && respuesta.sandbox_init_point
          ? respuesta.sandbox_init_point
          : respuesta.init_point,
      referencia: respuesta.id,
      expiraAt: datos.expiraAt,
    };
  }

  async verificarWebhook(req: Request): Promise<EventoPagoProveedor | null> {
    const url = new URL(req.url);
    const cuerpo = (await req.json().catch(() => null)) as null | {
      id?: string | number;
      type?: string;
      action?: string;
      data?: { id?: string | number };
    };
    const dataId = String(
      url.searchParams.get("data.id") ?? cuerpo?.data?.id ?? "",
    );
    const requestId = req.headers.get("x-request-id") ?? "";
    const signature = req.headers.get("x-signature") ?? "";
    if (
      !dataId ||
      !verificarFirmaMercadoPago({
        signature,
        requestId,
        dataId,
        secret: this.config.webhookSecret,
      })
    ) {
      throw new Error("firma de webhook inválida");
    }
    if (
      cuerpo?.type !== "payment" &&
      url.searchParams.get("type") !== "payment"
    )
      return null;
    const pago = await this.solicitar<PagoMp>(
      `/v1/payments/${encodeURIComponent(dataId)}`,
    );
    const normalizado = normalizarPago(pago);
    return {
      eventoId: String(cuerpo?.id ?? requestId),
      tipo: String(cuerpo?.action ?? "payment.updated"),
      ...normalizado,
    };
  }

  async consultarPago(referencia: string) {
    const preferencia = await this.solicitar<{ external_reference?: string }>(
      `/checkout/preferences/${encodeURIComponent(referencia)}`,
    );
    if (!preferencia.external_reference) return null;
    const busqueda = await this.solicitar<{ results?: PagoMp[] }>(
      `/v1/payments/search?external_reference=${encodeURIComponent(preferencia.external_reference)}&sort=date_created&criteria=desc`,
    );
    const pago = busqueda.results?.[0];
    return pago ? normalizarPago(pago) : null;
  }

  async reembolsar(
    referencia: string,
    monto?: string,
    idempotencyKey?: string,
  ): Promise<ResultadoReembolso> {
    const resultado = await this.solicitar<{
      id: string | number;
      status?: string;
    }>(`/v1/payments/${encodeURIComponent(referencia)}/refunds`, {
      method: "POST",
      headers: {
        "X-Idempotency-Key": idempotencyKey ?? `reembolso-${referencia}-${monto ?? "total"}`,
      },
      body: JSON.stringify(monto ? { amount: Number(monto) } : {}),
    });
    return {
      referencia: String(resultado.id),
      estado:
        resultado.status === "approved"
          ? "aprobado"
          : resultado.status === "rejected" || resultado.status === "cancelled"
            ? "rechazado"
            : "pendiente",
    };
  }

  async consultarReembolso(
    referenciaPago: string,
    referenciaReembolso: string,
  ): Promise<ResultadoReembolso> {
    const resultado = await this.solicitar<{
      id: string | number;
      status?: string;
    }>(
      `/v1/payments/${encodeURIComponent(referenciaPago)}/refunds/${encodeURIComponent(referenciaReembolso)}`,
    );
    return {
      referencia: String(resultado.id),
      estado:
        resultado.status === "approved"
          ? "aprobado"
          : resultado.status === "rejected" || resultado.status === "cancelled"
            ? "rechazado"
            : "pendiente",
    };
  }
}
