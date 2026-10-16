import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db, dbRaw, runWithOrg } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { ipCliente, permitido } from "@/lib/rate-limit";

export const hashClaveCanal = (clave: string) => createHash("sha256").update(clave).digest("hex");

export async function conCanalApi(req: NextRequest, id: string, handler: (canalId: bigint) => Promise<Response>) {
  if (!permitido(`api-canal:${ipCliente(Object.fromEntries(req.headers))}`, 300, 60_000)) {
    return NextResponse.json({ error: "demasiadas peticiones" }, { status: 429 });
  }
  const canalId = aBigInt(id);
  const clave = req.headers.get("x-api-key");
  const noAutorizado = () => NextResponse.json({ error: "canal o clave inválidos" }, { status: 401 });
  if (canalId == null || !clave || clave.length > 256) return noAutorizado();
  const filas = await dbRaw.$queryRawUnsafe<{ org: bigint | null }[]>("SELECT resolve_org_by_canal($1) AS org", canalId);
  if (filas[0]?.org == null) return noAutorizado();
  return runWithOrg(filas[0].org, async () => {
    const canal = await db.canalWhatsapp.findFirst({ where: { id: canalId, proveedor: "api", activo: true } });
    const config = canal?.config as Record<string, unknown> | undefined;
    const esperado = Buffer.from(typeof config?.apiKeyHash === "string" ? config.apiKeyHash : "");
    const recibido = Buffer.from(hashClaveCanal(clave));
    if (!canal || esperado.length !== recibido.length || !timingSafeEqual(esperado, recibido)) return noAutorizado();
    return handler(canal.id);
  });
}
