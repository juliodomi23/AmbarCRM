import type {
  DatosCheckout,
  EventoPagoProveedor,
  ProveedorPago,
  ResultadoReembolso,
} from "@/lib/pagos/tipos";
import { verificarFirmaMock } from "@/lib/pagos/firmas";

export class ProveedorMock implements ProveedorPago {
  readonly clave = "mock" as const;

  constructor(
    private readonly secret: string,
    private readonly baseUrl: string,
  ) {}

  async crearCheckout(datos: DatosCheckout) {
    return {
      url: `${this.baseUrl}/pagos/resultado?estado=pendiente&pago=${encodeURIComponent(datos.pagoId)}`,
      referencia: `mock-${datos.pagoId}`,
      expiraAt: datos.expiraAt,
    };
  }

  async verificarWebhook(req: Request): Promise<EventoPagoProveedor | null> {
    const cuerpoTexto = await req.text();
    const timestamp = req.headers.get("x-mock-timestamp") ?? "";
    const firma = req.headers.get("x-mock-signature") ?? "";
    if (
      !this.secret ||
      !verificarFirmaMock({
        cuerpo: cuerpoTexto,
        timestamp,
        firma,
        secret: this.secret,
      })
    ) {
      throw new Error("firma de webhook inválida");
    }
    const cuerpo = JSON.parse(cuerpoTexto) as EventoPagoProveedor;
    return cuerpo;
  }

  async consultarPago() {
    return null;
  }

  async reembolsar(
    referencia: string,
    _monto?: string,
    idempotencyKey?: string,
  ): Promise<ResultadoReembolso> {
    return {
      referencia: `refund-${referencia}-${idempotencyKey ?? "total"}`,
      estado: "aprobado",
    };
  }
}
