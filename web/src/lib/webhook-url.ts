import { promises as dns } from "node:dns";
import { isIP } from "node:net";

const NOMBRES_INTERNOS = /(^|\.)(localhost|local|internal|lan|home|corp)$/;

/** true si la IP no es enrutable en internet (loopback, privada, enlace local, CGNAT, ULA…). */
export function esIpInterna(ip: string): boolean {
  const limpia = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(limpia) === 4) {
    const [a, b] = limpia.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  if (isIP(limpia) === 6) {
    const mapeada = limpia.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapeada) return esIpInterna(mapeada[1]);
    if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(limpia)) return true;
    return limpia === "::" || limpia === "::1" || /^(fc|fd|fe[89ab]|ff)/.test(limpia);
  }
  return false;
}

/**
 * Valida destinos configurados por un administrador antes de que el servidor
 * les haga requests. No se siguen redirecciones para evitar saltos a destinos
 * internos. Los nombres sin punto (p. ej. "db" o "app" de Docker) se rechazan.
 */
export function validarWebhookUrl(valor: string): string | null {
  const url = valor.trim();
  if (!url) return "falta la URL del webhook";

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "la URL del webhook no es válida";
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return "el webhook debe usar http o https";
  }
  if (parsed.username || parsed.password) {
    return "la URL del webhook no puede incluir credenciales";
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    esIpInterna(hostname) ||
    (!isIP(hostname) && (!hostname.includes(".") || NOMBRES_INTERNOS.test(hostname)))
  ) {
    return "el webhook no puede apuntar a una dirección local o privada";
  }

  return null;
}

/** Comprueba, justo antes de enviar, que el dominio no resuelve a una IP interna.
 *  ponytail: queda la ventana de DNS rebinding entre esta consulta y el fetch; si importa,
 *  fijar la IP resuelta con un Agent de undici. */
export async function destinoPublico(valor: string): Promise<boolean> {
  if (validarWebhookUrl(valor)) return false;
  const hostname = new URL(valor).hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname)) return true;
  try {
    const direcciones = await dns.lookup(hostname, { all: true, verbatim: true });
    return direcciones.length > 0 && direcciones.every((d) => !esIpInterna(d.address));
  } catch {
    return false;
  }
}
