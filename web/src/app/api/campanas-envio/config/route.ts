import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { conModulo } from "@/lib/con-modulo";
import { getProvider } from "@/lib/channel";
import { cambiarEnviosCampanas, getAjustes } from "@/lib/services/config";
import { estadosPlantillaElegibles } from "@/lib/campanas-envio-plantilla";

export const GET = conModulo("campanas_envio", {}, async (_sesion, req: NextRequest) => {
  const canales = await db.canalWhatsapp.findMany({ where: { proveedor: "cloud_api", activo: true, estado: "conectado" }, select: { id: true, nombre: true, config: true, instancia: true } });
  const canalId = req.nextUrl.searchParams.get("canalId");
  const canal = canales.find((c) => String(c.id) === canalId) ?? canales[0];
  const plantillas = canal ? (await getProvider("cloud_api", canal.config, canal.instancia).listarPlantillas?.() ?? []).filter((p) => p.status && estadosPlantillaElegibles.includes(p.status)) : [];
  const etiquetas = await db.etiqueta.findMany({ orderBy: { nombre: "asc" }, select: { id: true, nombre: true } });
  const ajustes = await getAjustes();
  return Response.json({ canales: canales.map((c) => ({ id: String(c.id), nombre: c.nombre })), plantillas, etiquetas: etiquetas.map((e) => ({ id: String(e.id), nombre: e.nombre })), tarifaMarketingUsd: Number(ajustes.tarifaMarketingUsd), campanasEnvioActivas: ajustes.campanasEnvioActivas, campanasEnvioCambiadoPor: ajustes.campanasEnvioCambiadoPor?.toString() ?? null, campanasEnvioCambiadoAt: ajustes.campanasEnvioCambiadoAt });
});

export const PATCH = conModulo("campanas_envio", { admin: true }, async (sesion, req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  if (typeof body.campanasEnvioActivas !== "boolean") return Response.json({ error: "Indica si los envíos deben estar activos" }, { status: 400 });
  if (!sesion.userId) return Response.json({ error: "no autorizado" }, { status: 401 });
  const ajustes = await cambiarEnviosCampanas(body.campanasEnvioActivas, sesion.userId);
  return Response.json({ campanasEnvioActivas: ajustes.campanasEnvioActivas, campanasEnvioCambiadoPor: ajustes.campanasEnvioCambiadoPor?.toString() ?? null, campanasEnvioCambiadoAt: ajustes.campanasEnvioCambiadoAt });
});
