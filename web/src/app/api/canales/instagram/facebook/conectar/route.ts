import { NextRequest, NextResponse } from "next/server";
import { conMessengerLogin, cookieCanal, opcionesCookieCanal } from "@/lib/meta/messenger-login-http";
import { conectarPaginaMessenger } from "@/lib/services/messenger-login";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return conMessengerLogin(req, "conectar", async (identidad, body) => {
    const resultado = await conectarPaginaMessenger(identidad, req.cookies.get(cookieCanal("instagram"))?.value ?? "", req.headers.get("x-messenger-state"), body.page_id, body.nombre, "instagram");
    const res = NextResponse.json(resultado);
    res.cookies.set(cookieCanal("instagram"), "", { ...opcionesCookieCanal("instagram"), maxAge: 0 });
    return res;
  }, "instagram");
}
