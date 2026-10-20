import { after, NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { ipCliente, permitido } from "@/lib/rate-limit";
import { MENSAJE_RECUPERAR, solicitarRestablecimiento } from "@/lib/recuperar-password";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const org = typeof body?.org === "string" ? body.org.trim().toLowerCase() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const ipPermitida = permitido(`recuperar-ip:${ipCliente(Object.fromEntries(req.headers))}`, 5, 60 * 60_000);
  const clave = createHash("sha256").update(JSON.stringify([org, email])).digest("hex");
  const cuentaPermitida = permitido(`recuperar-cuenta:${clave}`, 5, 60 * 60_000);

  // La consulta y SMTP ocurren después de responder: su duración no permite enumerar cuentas.
  after(async () => {
    if (!ipPermitida || !cuentaPermitida || !/^[a-z0-9-]{1,100}$/.test(org) || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    try {
      await solicitarRestablecimiento(org, email);
    } catch {
      console.error("[recuperar] No se pudo procesar la solicitud");
    }
  });
  return NextResponse.json({ mensaje: MENSAJE_RECUPERAR }, { headers: { "Cache-Control": "no-store" } });
}
