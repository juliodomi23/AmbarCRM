// Enrutador de la API simulada: tabla explícita de [método, patrón, manejador].
// Lo que no esté registrado aquí NO existe en la demo (la capa responde error + toast y nunca sale a la red).

export class ErrorApi extends Error {
  constructor(
    public status: number,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

export type Ctx = {
  metodo: string;
  url: URL;
  params: Record<string, string>;
  cuerpo: any;
};

/** Respuesta con código distinto de 200. */
export class Respuesta {
  constructor(
    public status: number,
    public json: unknown,
  ) {}
}

type Manejador = (c: Ctx) => unknown | Promise<unknown>;
type Entrada = { metodo: string; partes: string[]; manejador: Manejador };

const tabla: Entrada[] = [];

export function ruta(metodos: string, patron: string, manejador: Manejador) {
  for (const metodo of metodos.split("|")) tabla.push({ metodo, partes: patron.split("/").filter(Boolean), manejador });
}

export function resolver(metodo: string, pathname: string) {
  const partes = pathname.split("/").filter(Boolean);
  for (const e of tabla) {
    if (e.metodo !== metodo || e.partes.length !== partes.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < partes.length; i++) {
      if (e.partes[i].startsWith(":")) params[e.partes[i].slice(1)] = decodeURIComponent(partes[i]);
      else if (e.partes[i] !== partes[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { manejador: e.manejador, params };
  }
  return null;
}

/** Lista legible de los endpoints soportados (la usa scripts/check-demo.ts y la documentación). */
export const endpointsSoportados = () => tabla.map((e) => `${e.metodo} /${e.partes.join("/")}`);
