/** Error de negocio del módulo CFDI. El status se devuelve tal cual en la API. */
export class ErrorCfdi extends Error {
  readonly status: number;
  readonly codigo?: string;

  constructor(message: string, status = 400, codigo?: string) {
    super(message);
    this.name = "ErrorCfdi";
    this.status = status;
    this.codigo = codigo;
  }
}
