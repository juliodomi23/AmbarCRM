// Capa de red simulada de la demo. Se instala SOLO mientras /demo está montado y se retira al salir:
// fuera de /demo nadie ve un fetch alterado.
//
//  · fetch        → API simulada (lib/demo/api); prefetch RSC → 204 vacío; otro origen/ruta → bloqueado.
//  · EventSource  → bus interno del almacén (nunca abre /api/stream).
//  · Notification, serviceWorker.register, sendBeacon, XMLHttpRequest → inertes o bloqueados.
import { toast } from "@/components/Toaster";
import { atender } from "./api";
import { almacen } from "./almacen";
import { irA } from "./navegacion";

export const MENSAJE_NO_GUARDA = "En la demo esto no se guarda";

/** Registro de cada petición atendida o bloqueada por la capa (lo lee el recorrido de pruebas). */
export type RegistroCapa = { metodo: string; ruta: string; soportado: boolean };
const registro: RegistroCapa[] = [];
export const registroCapa = () => registro;
if (typeof window !== "undefined") (window as any).__demoRegistro = registro; // lectura para las pruebas

let usos = 0;
let originales: null | {
  fetch: typeof fetch;
  EventSource: typeof EventSource;
  Notification: typeof Notification | undefined;
  beacon: typeof navigator.sendBeacon | undefined;
  xhrOpen: typeof XMLHttpRequest.prototype.open;
  open: typeof window.open;
  swRegister: ServiceWorkerContainer["register"] | undefined;
} = null;

function urlDe(input: RequestInfo | URL): URL {
  const crudo = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return new URL(crudo, window.location.href);
}

async function leerCuerpo(input: RequestInfo | URL, init?: RequestInit): Promise<unknown> {
  let cuerpo = init?.body;
  if (cuerpo == null && typeof Request !== "undefined" && input instanceof Request) {
    try {
      cuerpo = await input.clone().text();
    } catch {
      cuerpo = undefined;
    }
  }
  if (typeof cuerpo !== "string" || !cuerpo) return {};
  try {
    return JSON.parse(cuerpo);
  } catch {
    return {};
  }
}

const esEstatico = (u: URL) => u.pathname.startsWith("/_next/static/");

function json(status: number, cuerpo: unknown) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });
}

function crearFetchDemo(real: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = urlDe(input);
    const metodo = (init?.method ?? (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")).toUpperCase();
    // data: y blob: no son red.
    if (url.protocol === "data:" || url.protocol === "blob:") return real(input, init);
    if (url.origin !== window.location.origin) {
      registro.push({ metodo, ruta: url.href, soportado: false });
      return Promise.reject(new TypeError("Failed to fetch"));
    }
    if (esEstatico(url)) return real(input, init);
    // Prefetch / navegación RSC de <Link> y router.refresh(): nunca salen.
    const cabeceras = new Headers(init?.headers ?? (typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined));
    if (cabeceras.has("rsc") || cabeceras.has("next-router-prefetch") || url.searchParams.has("_rsc")) {
      registro.push({ metodo, ruta: url.pathname, soportado: true });
      return new Response(null, { status: 204 });
    }
    await new Promise((r) => setTimeout(r, 40));
    if (url.pathname.startsWith("/api/")) {
      const r = await atender(metodo, url, await leerCuerpo(input, init));
      registro.push({ metodo, ruta: url.pathname, soportado: r.soportado });
      if (!r.soportado) toast(MENSAJE_NO_GUARDA, "error");
      return json(r.status, r.json);
    }
    registro.push({ metodo, ruta: url.pathname, soportado: false });
    toast(MENSAJE_NO_GUARDA, "error");
    return json(501, { error: MENSAJE_NO_GUARDA });
  };
}

class EventSourceDemo extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  readonly url: string;
  readonly withCredentials = false;
  readyState = 0;
  onopen: ((e: Event) => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  private baja: () => void;
  private temporizador: ReturnType<typeof setTimeout>;
  constructor(url: string | URL) {
    super();
    this.url = String(url);
    this.temporizador = setTimeout(() => {
      this.readyState = 1;
      const e = new Event("open");
      this.onopen?.(e);
      this.dispatchEvent(e);
    }, 60);
    this.baja = almacen.escucharEventos((evento) => {
      if (this.readyState !== 1) return;
      const m = new MessageEvent("message", { data: JSON.stringify(evento) });
      this.onmessage?.(m);
      this.dispatchEvent(m);
    });
  }
  close() {
    this.readyState = 2;
    clearTimeout(this.temporizador);
    this.baja();
  }
}

/** Instala la capa y devuelve la función que la retira. Admite montajes repetidos (StrictMode). */
export function instalarCapa(): () => void {
  if (typeof window === "undefined") return () => {};
  if (usos++ === 0) {
    originales = {
      fetch: window.fetch,
      EventSource: window.EventSource,
      Notification: (window as any).Notification,
      beacon: navigator.sendBeacon?.bind(navigator),
      xhrOpen: XMLHttpRequest.prototype.open,
      open: window.open,
      swRegister: navigator.serviceWorker?.register?.bind(navigator.serviceWorker),
    };
    const real = window.fetch.bind(window);
    window.fetch = crearFetchDemo(real);
    window.EventSource = EventSourceDemo as unknown as typeof EventSource;
    // Sin permiso de notificaciones (el chat lo pide al abrir) ni service worker (PushSetup).
    (window as any).Notification = class {
      static permission = "denied";
      static requestPermission = async () => "denied";
    };
    // Tickets, enlaces públicos…: páginas del servidor que la demo no abre.
    window.open = ((url?: string | URL, ...resto: any[]) => {
      const destino = url ? new URL(String(url), window.location.href) : null;
      if (destino && destino.origin === window.location.origin) {
        // Tickets y páginas públicas se muestran dentro de la demo (vista pública), no en otra pestaña del servidor.
        if (/^\/(tienda|reservar|cotizacion|opinion|caja\/ticket)(\/|$)/.test(destino.pathname)) irA(`${destino.pathname}${destino.search}`);
        else toast(MENSAJE_NO_GUARDA, "error");
        return null;
      }
      return originales!.open.call(window, url, ...resto);
    }) as typeof window.open;
    if (navigator.sendBeacon) navigator.sendBeacon = () => true;
    XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, metodo: string, url: string | URL, ...resto: any[]) {
      const destino = new URL(String(url), window.location.href);
      if (destino.origin === window.location.origin && !esEstatico(destino)) throw new Error(MENSAJE_NO_GUARDA);
      return (originales!.xhrOpen as any).call(this, metodo, url, ...resto);
    } as typeof XMLHttpRequest.prototype.open;
    if (navigator.serviceWorker) {
      (navigator.serviceWorker as any).register = () => Promise.reject(new Error("Sin service worker en la demo"));
    }
  }
  let retirada = false;
  return () => {
    if (retirada) return;
    retirada = true;
    if (--usos > 0 || !originales) return;
    window.fetch = originales.fetch;
    window.open = originales.open;
    window.EventSource = originales.EventSource;
    (window as any).Notification = originales.Notification;
    if (originales.beacon) navigator.sendBeacon = originales.beacon;
    XMLHttpRequest.prototype.open = originales.xhrOpen;
    if (navigator.serviceWorker) delete (navigator.serviceWorker as any).register;
    originales = null;
  };
}
