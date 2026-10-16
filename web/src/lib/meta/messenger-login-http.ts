import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { requireSesion } from "@/lib/session";
import { ipCliente, permitido } from "@/lib/rate-limit";
import { ErrorRetail } from "@/lib/retail-db";
import type { IdentidadLogin } from "@/lib/services/messenger-login";

export const COOKIE_MESSENGER = "ambar-messenger-login";
export const COOKIE_OPCIONES = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/api/canales/messenger/facebook" };

export async function conMessengerLogin(req: NextRequest, ruta: string, operacion: (identidad: IdentidadLogin, body: Record<string, unknown>) => Promise<NextResponse>) {
  const sesion = await requireSesion(true);
  if ("error" in sesion) return sesion.error;
  const headers = { "Cache-Control": "no-store" };
  try {
    if (!sesion.orgId || !sesion.userId) throw new ErrorRetail("Sesión sin empresa o usuario.", 403);
    const origen = new URL(process.env.NEXTAUTH_URL || req.url).origin;
    if (req.headers.get("origin") !== origen || req.headers.get("sec-fetch-site") === "cross-site") throw new ErrorRetail("Origen de conexión inválido.", 403);
    if (!permitido(`messenger-login:${ruta}:${sesion.orgId}:${sesion.userId}`, 20, 600_000) ||
        !permitido(`messenger-login-ip:${ruta}:${ipCliente(Object.fromEntries(req.headers))}`, 60, 600_000)) {
      return NextResponse.json({ error: "Demasiados intentos. Espera diez minutos antes de reconectar." }, { status: 429, headers: { ...headers, "Retry-After": "600" } });
    }
    if (!req.headers.get("content-type")?.startsWith("application/json")) throw new ErrorRetail("Se requiere JSON.", 415);
    const texto = await req.text();
    if (texto.length > 16_384) throw new ErrorRetail("Solicitud demasiado grande.", 413);
    let body: Record<string, unknown>;
    try { body = JSON.parse(texto); } catch { throw new ErrorRetail("JSON inválido."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ErrorRetail("Solicitud inválida.");
    const sessionToken = await getToken({ req, raw: true });
    if (!sessionToken) throw new ErrorRetail("Sesión inválida.", 401);
    const res = await operacion({ orgId: sesion.orgId, userId: sesion.userId, sessionToken }, body);
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (error) {
    return NextResponse.json({ error: error instanceof ErrorRetail ? error.message : "No se pudo conectar con Facebook. Reintenta o usa la conexión manual." },
      { status: error instanceof ErrorRetail ? error.status : 500, headers });
  }
}
