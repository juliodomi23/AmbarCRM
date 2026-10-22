import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { respuestaCSV, toCSV } from "@/lib/csv";

type Props = { params: Promise<{ id: string }> };

export const GET = conModulo("campanas_envio", {}, async (_sesion, _req: Request, { params }: Props) => {
  const id = BigInt((await params).id);
  const campana = await db.campanaEnvio.findFirst({ where: { id }, select: { id: true } });
  if (!campana) return Response.json({ error: "Campaña inexistente" }, { status: 404 });
  const destinatarios = await db.campanaDestinatario.findMany({ where: { campanaId: id }, orderBy: { id: "asc" }, include: { contacto: { select: { nombre: true, optOutDifusion: true } } } });
  const csv = toCSV(["telefono", "nombre", "estado", "motivo", "error_codigo", "enviado_at", "baja"], destinatarios.map((d) => [d.telefono, d.contacto.nombre, d.estado, d.motivo, d.errorCodigo, d.enviadoAt?.toISOString(), d.contacto.optOutDifusion ? "Sí" : "No"]));
  return respuestaCSV(csv, `campana-${id}.csv`);
});
