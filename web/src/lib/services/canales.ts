import { randomBytes } from "node:crypto";
import { db, dbRaw } from "@/lib/db";
import { hashClaveCanal } from "@/lib/canal-api-auth";
import { encryptMetaToken } from "@/lib/meta/credentials";
import { validarUrlCanalApi } from "@/lib/api-webhook";
import { destinoPublico } from "@/lib/webhook-url";
import { ErrorRetail } from "@/lib/retail-db";
import { suscribirPagina } from "@/lib/channel/messenger";

export function credencialesApi() {
  const apiKey = randomBytes(32).toString("hex");
  const secret = randomBytes(32).toString("hex");
  return { apiKey, secret, config: { apiKeyHash: hashClaveCanal(apiKey), secretEncrypted: encryptMetaToken(secret) } };
}

export async function validarWebhookApi(webhookUrl: unknown) {
  if (typeof webhookUrl !== "string") throw new ErrorRetail("falta webhook_url");
  const error = validarUrlCanalApi(webhookUrl);
  if (error) throw new ErrorRetail(error);
  if (!(await destinoPublico(webhookUrl))) throw new ErrorRetail("el webhook debe resolver a una dirección pública");
  return webhookUrl.trim();
}

export async function crearCanalApi(nombre: string, webhookUrl: unknown) {
  if (!nombre.trim() || nombre.length > 150) throw new ErrorRetail("nombre inválido");
  const url = await validarWebhookApi(webhookUrl);
  const { apiKey, secret, config } = credencialesApi();
  const canal = await db.canalWhatsapp.create({ data: {
    nombre: nombre.trim(), proveedor: "api", estado: "conectado", config: { ...config, webhookUrl: url },
  } });
  return { id: String(canal.id), nombre: canal.nombre, apiKey, secret };
}

export async function editarCanalApi(id: bigint, body: Record<string, unknown>) {
  const canal = await db.canalWhatsapp.findFirst({ where: { id, proveedor: "api" } });
  if (!canal) throw new ErrorRetail("canal inexistente", 404);
  const config = { ...(canal.config as Record<string, unknown>) };
  const nombre = body.nombre == null ? canal.nombre : String(body.nombre).trim();
  if (!nombre || nombre.length > 150) throw new ErrorRetail("nombre inválido");
  if ("webhook_url" in body) config.webhookUrl = await validarWebhookApi(body.webhook_url);
  const nuevas = body.regenerar === true ? credencialesApi() : null;
  if (nuevas) Object.assign(config, nuevas.config);
  await db.canalWhatsapp.update({ where: { id }, data: { nombre, config: config as Record<string, string>, estado: "conectado" } });
  return { ok: true, ...(nuevas ? { apiKey: nuevas.apiKey, secret: nuevas.secret } : {}) };
}

export async function guardarCanalMessenger(body: Record<string, unknown>, id?: bigint) {
  const canal = id == null ? null : await db.canalWhatsapp.findFirst({ where: { id, proveedor: "messenger" } });
  if (id != null && !canal) throw new ErrorRetail("canal inexistente", 404);
  const config = { ...(canal?.config as Record<string, unknown> ?? {}) };
  const nombre = String(body.nombre ?? canal?.nombre ?? "").trim();
  const pageId = String(body.page_id ?? config.pageId ?? "").trim();
  if (!nombre || nombre.length > 150 || !/^\d{1,40}$/.test(pageId)) throw new ErrorRetail("nombre o page_id inválidos");
  const filas = await dbRaw.$queryRaw<{ org: bigint | null }[]>`SELECT resolve_org_by_page(${pageId}) AS org`;
  if (filas[0]?.org != null && !(canal?.activo && canal.orgId === filas[0].org && (canal.config as Record<string, unknown>)?.pageId === pageId)) {
    throw new ErrorRetail("esa página ya está conectada", 409);
  }
  if (body.page_access_token != null && body.page_access_token !== "") {
    if (typeof body.page_access_token !== "string" || body.page_access_token.length > 8192) throw new ErrorRetail("token de página inválido");
    config.tokenEncrypted = encryptMetaToken(body.page_access_token.trim());
  }
  if (!config.tokenEncrypted) throw new ErrorRetail("falta el token de acceso de la página");
  if (body.quitar_app === true) { delete config.appSecretEncrypted; delete config.appId; }
  else {
  if (body.app_secret != null && body.app_secret !== "") {
    if (typeof body.app_secret !== "string" || !body.app_secret.trim() || body.app_secret.length > 8192) throw new ErrorRetail("app_secret inválido");
    config.appSecretEncrypted = encryptMetaToken(body.app_secret.trim());
  }
  if (body.app_id != null && body.app_id !== "") {
    if (typeof body.app_id !== "string" || !/^\d{1,40}$/.test(body.app_id.trim())) throw new ErrorRetail("app_id inválido");
    config.appId = body.app_id.trim();
  }
  }
  config.pageId = pageId;
  delete config.errorAutorizacion;
  try { await suscribirPagina(config); }
  catch (e) { throw new ErrorRetail(e instanceof Error ? e.message : "Meta no permitió suscribir la página", 502); }
  const data = { nombre, config: config as Record<string, string>, estado: "conectado" as const };
  try {
    const guardado = canal
      ? await db.canalWhatsapp.update({ where: { id: canal.id }, data })
      : await db.canalWhatsapp.create({ data: { ...data, proveedor: "messenger", instancia: pageId } });
    return { id: String(guardado.id), nombre: guardado.nombre, ok: true };
  } catch (e) {
    const error = e as { code?: string; meta?: { code?: string } };
    if (error.code === "P2002" || error.code === "23505" || error.meta?.code === "23505") throw new ErrorRetail("esa página ya está conectada", 409);
    throw e;
  }
}
