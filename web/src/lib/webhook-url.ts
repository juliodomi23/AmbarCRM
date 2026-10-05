const PRIVATE_IPV4 = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/;

/**
 * Valida destinos configurados por un administrador antes de que el servidor
 * les haga requests. No se siguen redirecciones para evitar saltos a destinos
 * internos.
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
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost") ||
    PRIVATE_IPV4.test(hostname)
  ) {
    return "el webhook no puede apuntar a una dirección local o privada";
  }

  return null;
}
