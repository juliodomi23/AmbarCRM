export type EstadoPago =
  | "pendiente"
  | "aprobado"
  | "rechazado"
  | "cancelado"
  | "reembolsado";

export type DatosCheckout = {
  pagoId: string;
  titulo: string;
  monto: string;
  moneda: string;
  idempotencyKey: string;
  urlResultado: string;
  urlWebhook: string;
  expiraAt: Date;
};

export type EventoPagoProveedor = {
  eventoId: string;
  tipo: string;
  pagoId: string;
  referencia: string;
  estado: EstadoPago;
  monto: string;
  moneda: string;
  montoReembolsado?: string;
  contracargo?: boolean;
  payload: Record<string, string | number | boolean | null>;
};

export type ResultadoReembolso = {
  referencia: string;
  estado: "aprobado" | "pendiente" | "rechazado";
};

export interface ProveedorPago {
  readonly clave: "mercado_pago" | "mock";
  crearCheckout(
    datos: DatosCheckout,
  ): Promise<{ url: string; referencia: string; expiraAt: Date }>;
  verificarWebhook(req: Request): Promise<EventoPagoProveedor | null>;
  consultarPago(
    referencia: string,
  ): Promise<Omit<EventoPagoProveedor, "eventoId" | "tipo"> | null>;
  reembolsar(
    referencia: string,
    monto?: string,
    idempotencyKey?: string,
  ): Promise<ResultadoReembolso>;
  consultarReembolso(
    referenciaPago: string,
    referenciaReembolso: string,
  ): Promise<ResultadoReembolso>;
}
