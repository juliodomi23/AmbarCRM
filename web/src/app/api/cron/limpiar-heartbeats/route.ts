import { NextRequest } from "next/server";
import { requireApiKey } from "@/lib/api-auth";
import { dbRaw } from "@/lib/db";
import { transaccionTenant } from "@/lib/retail-db";

export async function POST(req: NextRequest) {
  const denegada = requireApiKey(req);
  if (denegada) return denegada;
  const orgs = await dbRaw.org.findMany({ select: { id: true } });
  const errores: string[] = [];
  let eliminados = 0;
  for (const org of orgs) {
    try {
      // Conserva ultimo_reporte para limitar ingesta y detectar el silencio tras la limpieza.
      eliminados += await transaccionTenant(org.id, async tx => (await tx.heartbeatServidor.deleteMany({ where: { fecha: { lt: new Date(Date.now() - 30 * 86400000) } } })).count);
    } catch { errores.push(String(org.id)); }
  }
  return Response.json({ ok: !errores.length, eliminados, empresasConError: errores });
}
