import { NextRequest, NextResponse } from "next/server";
import { conMessengerLogin, COOKIE_INSTAGRAM_OAUTH, OPCIONES_INSTAGRAM_OAUTH } from "@/lib/meta/messenger-login-http";
import { requireInstagramAppCredentials } from "@/lib/meta/config";
import { urlInstagramLogin } from "@/lib/meta/instagram-login";
import { iniciarInstagramLogin, LOGIN_DURACION_MS } from "@/lib/services/messenger-login";
import { ErrorRetail } from "@/lib/retail-db";

export async function POST(req: NextRequest) {
  return conMessengerLogin(req, "instagram-oauth", async (identidad, body) => {
    try { requireInstagramAppCredentials(); }
    catch { throw new ErrorRetail("Instagram Login no está configurado. Usa la conexión manual.", 409); }
    if (body.canal_id != null && (typeof body.canal_id !== "string" || !/^\d{1,18}$/.test(body.canal_id))) throw new ErrorRetail("Canal inválido.");
    if (body.nombre != null && (typeof body.nombre !== "string" || body.nombre.length > 150)) throw new ErrorRetail("Nombre inválido.");
    const intento = await iniciarInstagramLogin(identidad, body.canal_id ? BigInt(body.canal_id) : undefined);
    const origen = new URL(process.env.NEXTAUTH_URL || req.url).origin;
    const res = NextResponse.json({ url: urlInstagramLogin(origen, intento.state) });
    res.cookies.set(COOKIE_INSTAGRAM_OAUTH, `${intento.id}:${encodeURIComponent(String(body.nombre ?? ""))}`, { ...OPCIONES_INSTAGRAM_OAUTH, maxAge: LOGIN_DURACION_MS / 1000 });
    return res;
  }, "instagram");
}
