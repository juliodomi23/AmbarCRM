import { NextRequest } from "next/server";
import { dbRaw, runWithOrg } from "@/lib/db";
import { moduloHabilitado } from "@/lib/modulos";
import { transaccionTenant } from "@/lib/retail-db";
import { validarHeartbeat } from "@/lib/servidores";
import { conErrores } from "@/lib/errores-api";
import { hashHeartbeat } from "../../../../../scripts/lib/heartbeat-token.mjs";

export const POST = conErrores(async (req: NextRequest) => {
  const token = req.headers.get("x-heartbeat-token");
  if (!token || token.length > 256) return Response.json({ error: "token inválido" }, { status: 401 });
  const hash = hashHeartbeat(token);
  const identidades = await dbRaw.$queryRaw<{ org_id: bigint; servidor_id: bigint }[]>`SELECT * FROM resolve_servidor_by_heartbeat_hash(${hash})`;
  const identidad = identidades[0];
  if (!identidad) return Response.json({ error: "token inválido" }, { status: 401 });
  return runWithOrg(identidad.org_id, async () => {
    if (!await moduloHabilitado("servidores")) return Response.json({ error: "módulo no activo" }, { status: 404 });
    const datos = validarHeartbeat(await req.json());
    return transaccionTenant(identidad.org_id, async tx => {
      await tx.$queryRaw`SELECT id FROM servidores WHERE id=${identidad.servidor_id} FOR UPDATE`;
      const servidor = await tx.servidor.findFirst({ where: { id: identidad.servidor_id, activo: true, heartbeatTokenHash: hash } });
      if (!servidor) return Response.json({ error: "token inválido" }, { status: 401 });
      const ahora = new Date();
      if (servidor.ultimoReporte && ahora.getTime() - servidor.ultimoReporte.getTime() < 60000) return new Response(null, { status: 204 });
      await tx.heartbeatServidor.create({ data: { ...datos, servidorId: servidor.id, fecha: ahora } });
      await tx.servidor.update({ where: { id: servidor.id }, data: { ultimoReporte: ahora, ramTotalMb: datos.ramTotalMb } });
      return Response.json({ ok: true, servidor: servidor.nombre }, { status: 201 });
    });
  });
});
