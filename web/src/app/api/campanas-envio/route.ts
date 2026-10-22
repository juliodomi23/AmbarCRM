import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { conModulo } from "@/lib/con-modulo";
import { validarCalendario } from "@/lib/campanas-envio";
import { getProvider } from "@/lib/channel";
import { cantidadVariablesPlantilla, evaluarPlantillaParaLanzar } from "@/lib/campanas-envio-plantilla";

export const dynamic = "force-dynamic";

export const GET = conModulo("campanas_envio", {}, async () => {
  const campanas = await db.campanaEnvio.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { destinatarios: true } } } });
  return Response.json({ campanas: campanas.map((c) => ({ ...c, id: String(c.id), orgId: String(c.orgId), canalId: String(c.canalId), creadoPor: c.creadoPor?.toString() ?? null, listaAceptadaPor: c.listaAceptadaPor?.toString() ?? null })) });
});

export const POST = conModulo("campanas_envio", { admin: true }, async (sesion, req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const nombre = String(body.nombre ?? "").trim();
  if (!nombre || nombre.length > 120) return Response.json({ error: "Nombre inválido" }, { status: 400 });
  let canalId: bigint;
  try { canalId = BigInt(body.canalId); } catch { return Response.json({ error: "Selecciona un canal" }, { status: 400 }); }
  const canal = await db.canalWhatsapp.findFirst({ where: { id: canalId, activo: true, estado: "conectado", proveedor: "cloud_api" } });
  if (!canal) return Response.json({ error: "Selecciona un canal Cloud API conectado" }, { status: 400 });
  const plantillaNombre = String(body.plantillaNombre ?? "");
  const plantillaIdioma = String(body.plantillaIdioma ?? "");
  const mapeoVariables = body.mapeoVariables;
  if (!Array.isArray(mapeoVariables) || mapeoVariables.length > 20 || mapeoVariables.some((v: unknown) => typeof v !== "string" || v.length > 100))
    return Response.json({ error: "Mapeo de variables inválido" }, { status: 400 });
  if (Boolean(plantillaNombre) !== Boolean(plantillaIdioma)) return Response.json({ error: "Selecciona nombre e idioma de la plantilla" }, { status: 400 });
  const evaluacion = plantillaNombre ? await evaluarPlantillaParaLanzar(getProvider("cloud_api", canal.config, canal.instancia), plantillaNombre, plantillaIdioma) : null;
  if (evaluacion?.bloqueo) return evaluacion.bloqueo;
  if (evaluacion?.plantilla && cantidadVariablesPlantilla(evaluacion.plantilla) !== mapeoVariables.length)
    return Response.json({ error: "El número de variables no coincide con el mapeo del archivo" }, { status: 400 });
  let calendario;
  try { calendario = validarCalendario(body); } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
  const campana = await db.campanaEnvio.create({ data: { nombre, canalId, plantillaNombre, plantillaIdioma, plantillaEstado: evaluacion?.plantilla?.status ?? null, plantillaConsultadaAt: evaluacion ? new Date() : null, mapeoVariables, creadoPor: sesion.userId, ...calendario } });
  return Response.json({ id: String(campana.id) }, { status: 201 });
});
