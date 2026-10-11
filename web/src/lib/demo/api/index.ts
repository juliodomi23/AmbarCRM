// Punto de entrada de la API simulada: registra todos los manejadores y atiende una petición.
import "./marco";
import "./chat";
import "./ventas";
import "./modulos-giro";
import "./config";
import "./retail";
import "./extras";
import "./giros";
import "./caja";
import { ErrorApi, Respuesta, resolver, endpointsSoportados } from "./ruteo";

export { endpointsSoportados };

export type ResultadoApi = { status: number; json: unknown; soportado: boolean };

/** Atiende `metodo pathname` contra el almacén. Si no hay manejador: soportado=false. */
export async function atender(metodo: string, url: URL, cuerpo: unknown): Promise<ResultadoApi> {
  const hallado = resolver(metodo.toUpperCase(), url.pathname);
  if (!hallado) return { status: 501, json: { error: "En la demo esto no se guarda" }, soportado: false };
  try {
    const r = await hallado.manejador({ metodo: metodo.toUpperCase(), url, params: hallado.params, cuerpo: cuerpo ?? {} });
    if (r instanceof Respuesta) return { status: r.status, json: r.json, soportado: true };
    return { status: 200, json: r, soportado: true };
  } catch (e) {
    if (e instanceof ErrorApi) return { status: e.status, json: { error: e.message }, soportado: true };
    console.error("[demo] error en la API simulada", e);
    return { status: 500, json: { error: "Error en la demo" }, soportado: true };
  }
}
