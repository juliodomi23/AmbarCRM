import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { conModulo } from "@/lib/con-modulo";
import { getProvider } from "@/lib/channel";
import { getAjustes } from "@/lib/services/config";
import { horasDeTanda, reanudarCampana, validarCalendario } from "@/lib/campanas-envio";
import { transaccionTenant } from "@/lib/retail-db";
import { cantidadVariablesPlantilla, evaluarPlantillaParaLanzar } from "@/lib/campanas-envio-plantilla";

type Props = { params: Promise<{ id: string }> };
const estados = ["pendiente", "enviando", "enviado", "entregado", "leido", "respondio", "fallido", "omitido"];

export const GET = conModulo("campanas_envio", {}, async (sesion, req: NextRequest, { params }: Props) => {
  const id = BigInt((await params).id);
  const campana = await db.campanaEnvio.findFirst({ where: { id }, include: { canal: { select: { nombre: true } } } });
  if (!campana) return Response.json({ error: "Campaña inexistente" }, { status: 404 });
  const filtro = req.nextUrl.searchParams.get("estado");
  if (filtro && !estados.includes(filtro)) return Response.json({ error: "Estado inválido" }, { status: 400 });
  const [agrupados, destinatarios, ajustes, bajas] = await Promise.all([
    db.campanaDestinatario.groupBy({ by: ["estado"], where: { campanaId: id }, _count: true }),
    db.campanaDestinatario.findMany({ where: { campanaId: id, ...(filtro ? { estado: filtro } : {}) }, orderBy: { id: "asc" }, take: 200, include: { contacto: { select: { nombre: true, optOutDifusion: true } } } }),
    getAjustes(),
    db.campanaDestinatario.count({ where: { campanaId: id, contacto: { optOutDifusion: true } } }),
  ]);
  const conteos = Object.fromEntries(estados.map((estado) => [estado, agrupados.find((g) => g.estado === estado)?._count ?? 0]));
  const total = Object.values(conteos).reduce((a, b) => a + b, 0);
  const porDia = horasDeTanda(campana);
  const hoy = await transaccionTenant(sesion.orgId!, (tx) => tx.$queryRaw<{ total: bigint }[]>`SELECT count(*)::bigint AS total FROM campanas_destinatarios d JOIN campanas_envio c ON c.id = d.campana_id WHERE c.canal_id = ${campana.canalId} AND (d.enviado_at AT TIME ZONE ${campana.zonaHoraria})::date = (now() AT TIME ZONE ${campana.zonaHoraria})::date`);
  return Response.json({
    campana: { ...campana, id: String(campana.id), orgId: String(campana.orgId), canalId: String(campana.canalId), creadoPor: campana.creadoPor?.toString() ?? null, listaAceptadaPor: campana.listaAceptadaPor?.toString() ?? null },
    conteos: { ...conteos, bajas, total },
    hoy: Number(hoy[0]?.total ?? 0),
    porDia,
    diasEstimados: Math.ceil((conteos.pendiente + conteos.enviando) / porDia),
    tarifaMarketingUsd: Number(ajustes.tarifaMarketingUsd),
    costoEstimadoUsd: Number((total * Number(ajustes.tarifaMarketingUsd)).toFixed(2)),
    destinatarios: destinatarios.map((d) => ({ id: String(d.id), telefono: d.telefono, nombre: d.contacto.nombre, estado: d.estado, motivo: d.motivo, optOutDifusion: d.contacto.optOutDifusion, enviadoAt: d.enviadoAt }))
  });
});

export const PATCH = conModulo("campanas_envio", { admin: true }, async (_sesion, req: NextRequest, { params }: Props) => {
  const id = BigInt((await params).id);
  const campana = await db.campanaEnvio.findFirst({ where: { id }, include: { canal: true } });
  if (!campana) return Response.json({ error: "Campaña inexistente" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const accion = String(body.accion ?? "");
  if (accion === "plantilla") {
    if (campana.estado !== "borrador") return Response.json({ error: "Solo se cambia la plantilla de un borrador" }, { status: 409 });
    const nombre = String(body.plantillaNombre ?? "");
    const idioma = String(body.plantillaIdioma ?? "");
    if (!nombre || !idioma) return Response.json({ error: "Selecciona una plantilla" }, { status: 400 });
    const evaluacion = await evaluarPlantillaParaLanzar(getProvider("cloud_api", campana.canal.config, campana.canal.instancia), nombre, idioma);
    if (evaluacion.bloqueo) return evaluacion.bloqueo;
    if (cantidadVariablesPlantilla(evaluacion.plantilla!) !== (Array.isArray(campana.mapeoVariables) ? campana.mapeoVariables.length : 0))
      return Response.json({ error: "El número de variables no coincide con el mapeo del archivo" }, { status: 400 });
    await db.campanaEnvio.update({ where: { id }, data: { plantillaNombre: nombre, plantillaIdioma: idioma, plantillaEstado: evaluacion.plantilla!.status, plantillaConsultadaAt: new Date() } });
    return Response.json({ ok: true, plantillaEstado: evaluacion.plantilla!.status });
  }
  if (accion === "configurar") {
    if (campana.estado !== "borrador") return Response.json({ error: "Solo se configura un borrador" }, { status: 409 });
    let calendario;
    try { calendario = validarCalendario(body); } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
    await db.campanaEnvio.update({ where: { id }, data: calendario });
    return Response.json({ ok: true });
  }
  if (accion === "lanzar") {
    if (campana.estado !== "borrador" || body.confirmoPermiso !== true) return Response.json({ error: "Confirma el permiso de los contactos antes de lanzar" }, { status: 400 });
    const total = await db.campanaDestinatario.count({ where: { campanaId: id, estado: "pendiente" } });
    if (!total) return Response.json({ error: "No hay destinatarios" }, { status: 400 });
    if (!campana.canal.activo || campana.canal.estado !== "conectado" || campana.canal.proveedor !== "cloud_api") return Response.json({ error: "Canal desconectado" }, { status: 400 });
    if (!campana.plantillaNombre || !campana.plantillaIdioma) return Response.json({ error: "Selecciona una plantilla antes de lanzar" }, { status: 400 });
    const evaluacion = await evaluarPlantillaParaLanzar(getProvider("cloud_api", campana.canal.config, campana.canal.instancia), campana.plantillaNombre, campana.plantillaIdioma);
    if (evaluacion.bloqueo) return evaluacion.bloqueo;
    if (cantidadVariablesPlantilla(evaluacion.plantilla!) !== (Array.isArray(campana.mapeoVariables) ? campana.mapeoVariables.length : 0))
      return Response.json({ error: "El número de variables no coincide con el mapeo del archivo" }, { status: 400 });
    await db.campanaEnvio.update({ where: { id }, data: { estado: "programada", confirmoPermiso: true, permisoAt: new Date(), motivoPausa: null, plantillaEstado: evaluacion.plantilla!.status, plantillaConsultadaAt: new Date() } });
  } else if (accion === "pausar" && ["programada", "en_curso"].includes(campana.estado)) {
    await db.campanaEnvio.update({ where: { id }, data: { estado: "pausada", motivoPausa: "Pausada por el equipo" } });
  } else if (accion === "reanudar" && campana.estado === "pausada") {
    await reanudarCampana(id);
  } else if (accion === "cancelar" && !["cancelada", "completada"].includes(campana.estado)) {
    await db.campanaEnvio.update({ where: { id }, data: { estado: "cancelada" } });
  } else return Response.json({ error: "Transición inválida" }, { status: 409 });
  return Response.json({ ok: true });
});
