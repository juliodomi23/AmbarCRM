import { after, NextRequest, NextResponse } from "next/server";
import { avisarPasswordCambiada, ERROR_TOKEN, restablecerPassword } from "@/lib/recuperar-password";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  const nueva = typeof body?.nueva === "string" ? body.nueva : "";
  if (nueva.length < 8) return NextResponse.json({ error: "la contraseña debe tener al menos 8 caracteres" }, { status: 400 });
  try {
    const usuario = await restablecerPassword(token, nueva);
    if (!usuario) return NextResponse.json({ error: ERROR_TOKEN }, { status: 400 });
    after(() => avisarPasswordCambiada(usuario));
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("[restablecer] No se pudo procesar el cambio");
    return NextResponse.json({ error: "No se pudo cambiar la contraseña. Inténtalo de nuevo." }, { status: 503 });
  }
}
