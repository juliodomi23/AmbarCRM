import { createHmac, timingSafeEqual } from "node:crypto";
import type { DatosCheckout, EstadoPago, EventoPagoProveedor, ProveedorPago, ResultadoReembolso } from "@/lib/pagos/tipos";

type CuentaStripe = { id?: string; charges_enabled?: boolean; details_submitted?: boolean };
type StripeObject = {
  id?: string;
  object?: string;
  amount?: number;
  amount_total?: number;
  amount_refunded?: number;
  amount_received?: number;
  currency?: string;
  status?: string;
  payment_status?: string;
  payment_intent?: string | { id?: string } | null;
  latest_charge?: string | { id?: string } | null;
  client_reference_id?: string;
  metadata?: Record<string, string>;
  charge?: string | { id?: string };
  charges_enabled?: boolean;
  details_submitted?: boolean;
};
export type StripeEvent = { id?: string; type?: string; account?: string; livemode?: boolean; data?: { object?: StripeObject } };

export function montoAMinorUnits(monto: string) {
  const limpio = monto.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(limpio)) throw new Error("El monto de Stripe no es válido");
  const [entero, centavos = ""] = limpio.split(".");
  const resultado = BigInt(entero) * 100n + BigInt(centavos.padEnd(2, "0"));
  if (resultado <= 0n || resultado > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("El monto de Stripe está fuera de rango");
  return Number(resultado);
}

export function minorUnitsAMonto(valor: number) {
  if (!Number.isSafeInteger(valor) || valor < 0) throw new Error("Monto en centavos inválido");
  const entero = BigInt(valor);
  return `${entero / 100n}.${String(entero % 100n).padStart(2, "0")}`;
}

export function expiracionCheckoutStripe(ahora = Date.now()) {
  return Math.floor(ahora / 1000) + 23 * 60 * 60;
}

function firmaStripeValida(cuerpo: string, firma: string, secreto: string, ahora = Date.now(), toleranciaSegundos = 300) {
  const partes = firma.split(",").map((parte) => parte.split("=", 2));
  const timestamp = partes.find(([clave]) => clave === "t")?.[1];
  const firmas = partes.filter(([clave]) => clave === "v1").map(([, valor]) => valor);
  if (!timestamp || !/^\d+$/.test(timestamp) || Math.abs(Math.floor(ahora / 1000) - Number(timestamp)) > toleranciaSegundos) return false;
  const esperada = createHmac("sha256", secreto).update(`${timestamp}.${cuerpo}`).digest();
  return firmas.some((valor) => {
    if (!/^[0-9a-f]{64}$/i.test(valor)) return false;
    const recibida = Buffer.from(valor, "hex");
    return recibida.length === esperada.length && timingSafeEqual(recibida, esperada);
  });
}

export async function leerEventoStripeFirmado(req: Request, secreto = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? ""): Promise<StripeEvent> {
  const cuerpo = await req.text();
  if (!secreto || !firmaStripeValida(cuerpo, req.headers.get("stripe-signature") ?? "", secreto)) throw new Error("firma de webhook inválida");
  try { return JSON.parse(cuerpo) as StripeEvent; }
  catch { throw new Error("payload de webhook inválido"); }
}

function idPaymentIntent(objeto: StripeObject) {
  return typeof objeto.payment_intent === "string" ? objeto.payment_intent : objeto.payment_intent?.id ?? "";
}

export class ProveedorStripe implements ProveedorPago {
  readonly clave = "stripe" as const;
  constructor(private readonly config: { secretKey: string; webhookSecret: string; accountId: string; sandbox: boolean }) {
    if (!config.secretKey || !config.webhookSecret || !/^acct_[A-Za-z0-9]+$/.test(config.accountId)) throw new Error("Stripe no está configurado para esta organización");
  }

  private async solicitar<T>(ruta: string, datos?: URLSearchParams, idempotencyKey?: string, cuenta = true): Promise<T> {
    const respuesta = await fetch(`https://api.stripe.com${ruta}`, {
      method: datos ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${this.config.secretKey}`,
        ...(datos ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        ...(cuenta ? { "Stripe-Account": this.config.accountId } : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: datos?.toString(),
    });
    const cuerpo = await respuesta.json().catch(() => ({})) as { error?: { message?: string } } & T;
    if (!respuesta.ok) throw new Error(`Stripe rechazó la operación (${respuesta.status})`);
    return cuerpo;
  }

  async crearCheckout(datos: DatosCheckout) {
    const campos = new URLSearchParams();
    const poner = (k: string, v: string | number) => campos.set(k, String(v));
    poner("mode", "payment");
    poner("success_url", `${datos.urlResultado}?pago=${encodeURIComponent(datos.pagoId)}&estado=exito`);
    poner("cancel_url", `${datos.urlResultado}?pago=${encodeURIComponent(datos.pagoId)}&estado=cancelado`);
    poner("client_reference_id", datos.pagoId);
    poner("currency", "mxn");
    poner("payment_method_types[0]", "card");
    poner("line_items[0][price_data][currency]", "mxn");
    poner("line_items[0][price_data][product_data][name]", datos.titulo);
    if (datos.descripcion) poner("line_items[0][price_data][product_data][description]", datos.descripcion);
    poner("line_items[0][price_data][unit_amount]", montoAMinorUnits(datos.monto));
    poner("line_items[0][quantity]", 1);
    poner("metadata[pagoId]", datos.pagoId);
    poner("payment_intent_data[metadata][pagoId]", datos.pagoId);
    poner("expires_at", expiracionCheckoutStripe());
    const session = await this.solicitar<{ id: string; url: string; expires_at: number }>("/v1/checkout/sessions", campos, datos.idempotencyKey);
    if (!session.id || !session.url) throw new Error("Stripe no devolvió una sesión de pago válida");
    return { url: session.url, referencia: session.id, expiraAt: new Date(session.expires_at * 1000) };
  }

  private async resolverPagoIntent(paymentIntent: string) {
    return this.solicitar<StripeObject>(`/v1/payment_intents/${encodeURIComponent(paymentIntent)}`);
  }

  async verificarWebhook(req: Request): Promise<EventoPagoProveedor | null> {
    const evento = await leerEventoStripeFirmado(req, this.config.webhookSecret);
    if (typeof evento.livemode === "boolean" && evento.livemode === this.config.sandbox) return null;
    const objeto = evento.data?.object;
    const cuentaId = evento.account ?? (evento.type === "account.application.deauthorized" ? objeto?.id : undefined);
    if (cuentaId !== this.config.accountId) throw new Error("cuenta conectada no corresponde a la organización");
    if (!objeto || !evento.id || !evento.type) return null;

    if (evento.type === "account.updated") {
      const cuenta = await this.solicitar<CuentaStripe>(`/v1/accounts/${encodeURIComponent(this.config.accountId)}`, undefined, undefined, false);
      return { eventoId: evento.id, tipo: evento.type, pagoId: "", referencia: this.config.accountId, estado: "pendiente", monto: "0.00", moneda: "MXN", payload: { event: evento.type }, cuenta: { id: this.config.accountId, chargesEnabled: cuenta.charges_enabled === true, detailsSubmitted: cuenta.details_submitted === true } };
    }
    if (evento.type === "account.application.deauthorized") {
      return { eventoId: evento.id, tipo: evento.type, pagoId: "", referencia: this.config.accountId, estado: "pendiente", monto: "0.00", moneda: "MXN", payload: { event: evento.type }, cuenta: { id: this.config.accountId, desautorizada: true } };
    }

    let pagoId = objeto.metadata?.pagoId ?? objeto.client_reference_id ?? "";
    let paymentIntent = idPaymentIntent(objeto);
    if (evento.type === "charge.refunded" || evento.type === "charge.dispute.created") {
      const chargeId = evento.type === "charge.dispute.created"
        ? (typeof objeto.charge === "string" ? objeto.charge : objeto.charge?.id) ?? ""
        : objeto.id ?? "";
      const charge = await this.solicitar<StripeObject>(`/v1/charges/${encodeURIComponent(chargeId)}`);
      paymentIntent = idPaymentIntent(charge);
      if (!paymentIntent) return null;
      const intent = await this.resolverPagoIntent(paymentIntent);
      pagoId = intent.metadata?.pagoId ?? "";
      if (!pagoId) return null;
      if (evento.type === "charge.dispute.created") return this.eventoPago(evento, pagoId, paymentIntent, intent, "aprobado", "0.00", true);
      return this.eventoPago(evento, pagoId, paymentIntent, intent, "aprobado", minorUnitsAMonto(objeto.amount_refunded ?? 0));
    }

    if (!pagoId) return null;
    const estado: EstadoPago = evento.type === "checkout.session.expired" ? "cancelado"
      : evento.type === "checkout.session.async_payment_failed" ? "rechazado"
        : evento.type === "checkout.session.async_payment_succeeded" ? "aprobado"
          : evento.type === "checkout.session.completed" && objeto.payment_status === "paid" ? "aprobado"
            : "pendiente";
    if (!paymentIntent && evento.type === "checkout.session.completed") paymentIntent = objeto.id ?? "";
    return this.eventoPago(evento, pagoId, paymentIntent, objeto, estado);
  }

  private eventoPago(evento: StripeEvent, pagoId: string, referencia: string, objeto: StripeObject, estado?: EstadoPago, montoReembolsado?: string, contracargo = false): EventoPagoProveedor {
    return {
      eventoId: evento.id ?? "", tipo: evento.type ?? "", pagoId, referencia, estado: estado ?? "pendiente",
      monto: minorUnitsAMonto(objeto.amount_total ?? objeto.amount ?? 0), moneda: String(objeto.currency ?? "mxn").toUpperCase(),
      ...(montoReembolsado !== undefined ? { montoReembolsado } : {}), ...(contracargo ? { contracargo: true } : {}),
      payload: { event: evento.type ?? "", status: objeto.payment_status ?? objeto.status ?? "" },
    };
  }

  async consultarPago(referencia: string) {
    const sesion = await this.solicitar<StripeObject & { expires_at?: number }>(`/v1/checkout/sessions/${encodeURIComponent(referencia)}`);
    const pagoId = sesion.metadata?.pagoId ?? sesion.client_reference_id ?? "";
    if (!pagoId) return null;
    const paymentIntent = idPaymentIntent(sesion);
    const intent = paymentIntent ? await this.resolverPagoIntent(paymentIntent) : sesion;
    const chargeId = typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
    const charge = chargeId ? await this.solicitar<StripeObject>(`/v1/charges/${encodeURIComponent(chargeId)}`) : null;
    const estado: EstadoPago = sesion.status === "expired" ? "cancelado" : sesion.payment_status === "paid" ? "aprobado" : "pendiente";
    return {
      pagoId, referencia: paymentIntent || sesion.id || "", estado,
      monto: minorUnitsAMonto(sesion.amount_total ?? 0), moneda: String(sesion.currency ?? "mxn").toUpperCase(),
      montoReembolsado: minorUnitsAMonto(charge?.amount_refunded ?? 0),
      payload: { status: sesion.status ?? "", paymentStatus: sesion.payment_status ?? "" },
    };
  }

  async reembolsar(referencia: string, monto?: string, idempotencyKey?: string): Promise<ResultadoReembolso> {
    const campos = new URLSearchParams({ payment_intent: referencia });
    if (monto) campos.set("amount", String(montoAMinorUnits(monto)));
    const resultado = await this.solicitar<{ id: string; status?: string }>("/v1/refunds", campos, idempotencyKey);
    return { referencia: resultado.id, estado: resultado.status === "succeeded" ? "aprobado" : ["failed", "canceled"].includes(resultado.status ?? "") ? "rechazado" : "pendiente" };
  }

  async consultarReembolso(_referenciaPago: string, referenciaReembolso: string): Promise<ResultadoReembolso> {
    const resultado = await this.solicitar<{ id: string; status?: string }>(`/v1/refunds/${encodeURIComponent(referenciaReembolso)}`);
    return { referencia: resultado.id, estado: resultado.status === "succeeded" ? "aprobado" : ["failed", "canceled"].includes(resultado.status ?? "") ? "rechazado" : "pendiente" };
  }
}

export async function crearCuentaStripe(secretKey: string, idempotencyKey: string, country = "MX") {
  if (!/^[A-Z]{2}$/.test(country)) throw new Error("STRIPE_PAIS debe ser un código ISO de dos letras");
  const campos = new URLSearchParams({ type: "standard", country });
  const respuesta = await fetch("https://api.stripe.com/v1/accounts", { method: "POST", headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": idempotencyKey }, body: campos.toString() });
  const resultado = await respuesta.json().catch(() => ({})) as CuentaStripe;
  if (!respuesta.ok || !resultado.id) throw new Error("Stripe no pudo crear la cuenta conectada");
  return resultado;
}

export async function crearAccountLink(secretKey: string, accountId: string, refreshUrl: string, returnUrl: string, idempotencyKey: string) {
  const campos = new URLSearchParams({ account: accountId, refresh_url: refreshUrl, return_url: returnUrl, type: "account_onboarding" });
  const respuesta = await fetch("https://api.stripe.com/v1/account_links", { method: "POST", headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": idempotencyKey }, body: campos.toString() });
  const resultado = await respuesta.json().catch(() => ({})) as { url?: string };
  if (!respuesta.ok || !resultado.url) throw new Error("Stripe no pudo crear el enlace de onboarding");
  return resultado.url;
}

export async function consultarCuentaStripe(secretKey: string, accountId: string) {
  const respuesta = await fetch(`https://api.stripe.com/v1/accounts/${encodeURIComponent(accountId)}`, { headers: { Authorization: `Bearer ${secretKey}` } });
  const resultado = await respuesta.json().catch(() => ({})) as CuentaStripe;
  if (!respuesta.ok || resultado.id !== accountId) throw new Error("Stripe no pudo consultar la cuenta conectada");
  return { chargesEnabled: resultado.charges_enabled === true, detailsSubmitted: resultado.details_submitted === true };
}
