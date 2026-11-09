import assert from "node:assert/strict";

export type RespuestaAPI<T = Record<string, unknown>> = {
  status: number;
  data: T & { error?: string };
};

function cookiesDe(respuesta: Response) {
  return respuesta.headers.getSetCookie().map((valor) => valor.split(";", 1)[0]).join("; ");
}

export async function loginE2E(baseUrl: string, email: string, orgSlug: string, password: string) {
  const csrf = await fetch(`${baseUrl}/api/auth/csrf`);
  assert.equal(csrf.status, 200);
  const inicial = cookiesDe(csrf);
  const { csrfToken } = await csrf.json();
  const respuesta = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { Cookie: inicial, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      csrfToken,
      email,
      password,
      orgSlug,
      json: "true",
      callbackUrl: baseUrl,
    }),
  });
  const sesion = `${inicial}; ${cookiesDe(respuesta)}`;
  assert.match(sesion, /next-auth\.session-token/, "NextAuth debe autenticar los usuarios sintéticos");
  const cuenta = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: sesion } }).then((res) => res.json());
  assert.equal(cuenta.user.email, email);
  return sesion;
}

export async function apiE2E<T = Record<string, unknown>>(
  baseUrl: string,
  cookie: string,
  ruta: string,
  method = "GET",
  cuerpo?: unknown,
): Promise<RespuestaAPI<T>> {
  const respuesta = await fetch(`${baseUrl}${ruta}`, {
    method,
    redirect: "manual",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { status: respuesta.status, data: await respuesta.json().catch(() => ({})) };
}

export async function paginaE2E(baseUrl: string, cookie: string, ruta: string) {
  const respuesta = await fetch(`${baseUrl}${ruta}`, { headers: { Cookie: cookie }, redirect: "manual" });
  return respuesta.status;
}
