import { NextRequest, NextResponse } from "next/server";
import { requireMetaAppCredentials } from "@/lib/meta/config";
import { configIdLogin, PERMISOS_MESSENGER } from "@/lib/meta/messenger-facebook";
import { conMessengerLogin, COOKIE_MESSENGER, COOKIE_OPCIONES } from "@/lib/meta/messenger-login-http";
import { iniciarMessengerLogin, listarPaginasMessenger, LOGIN_DURACION_MS } from "@/lib/services/messenger-login";
import { ErrorRetail } from "@/lib/retail-db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return conMessengerLogin(req, "paginas", async (identidad, body) => {
    if (body.accion === "iniciar") {
      let appId: string;
      try { ({ appId } = requireMetaAppCredentials()); }
      catch { throw new ErrorRetail("Este servidor no tiene configurada la app de Meta (META_APP_ID / META_APP_SECRET). Usa la conexión manual.", 409); }
      if (body.canal_id != null && (typeof body.canal_id !== "string" || !/^\d{1,18}$/.test(body.canal_id))) throw new ErrorRetail("Canal inválido.");
      const intento = await iniciarMessengerLogin(identidad, body.canal_id ? BigInt(String(body.canal_id)) : undefined);
      const res = NextResponse.json({ state: intento.state, appId, scope: PERMISOS_MESSENGER, configId: configIdLogin("messenger") });
      res.cookies.set(COOKIE_MESSENGER, intento.id, { ...COOKIE_OPCIONES, maxAge: LOGIN_DURACION_MS / 1000 });
      return res;
    }
    const paginas = await listarPaginasMessenger(identidad, req.cookies.get(COOKIE_MESSENGER)?.value ?? "", req.headers.get("x-messenger-state"), body.code);
    return NextResponse.json(paginas);
  });
}
