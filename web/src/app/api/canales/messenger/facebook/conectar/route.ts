import { NextRequest, NextResponse } from "next/server";
import { conMessengerLogin, COOKIE_MESSENGER, COOKIE_OPCIONES } from "@/lib/meta/messenger-login-http";
import { conectarPaginaMessenger } from "@/lib/services/messenger-login";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return conMessengerLogin(req, "conectar", async (identidad, body) => {
    const resultado = await conectarPaginaMessenger(identidad, req.cookies.get(COOKIE_MESSENGER)?.value ?? "", req.headers.get("x-messenger-state"), body.page_id, body.nombre);
    const res = NextResponse.json(resultado);
    res.cookies.set(COOKIE_MESSENGER, "", { ...COOKIE_OPCIONES, maxAge: 0 });
    return res;
  });
}
