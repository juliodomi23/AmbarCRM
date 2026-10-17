import { db, dbRaw } from "@/lib/db";
import { encryptMetaToken } from "@/lib/meta/credentials";
import { ErrorRetail } from "@/lib/retail-db";
import { suscribirCuenta } from "@/lib/channel/instagram";

function identificador(valor: unknown, campo: string) {
  if (typeof valor !== "string" || !/^\d{1,40}$/.test(valor.trim())) throw new ErrorRetail(`${campo} inválido`);
  return valor.trim();
}

function actualizarSecreto(config: Record<string, unknown>, valor: unknown, campo: string, destino: string) {
  if (valor == null || valor === "") return;
  if (typeof valor !== "string" || !valor.trim() || valor.length > 8192) throw new ErrorRetail(`${campo} inválido`);
  config[destino] = encryptMetaToken(valor.trim());
}

export async function guardarCanalInstagram(body: Record<string, unknown>, id?: bigint) {
  const canal = id == null ? null : await db.canalWhatsapp.findFirst({ where: { id, proveedor: "instagram" } });
  if (id != null && !canal) throw new ErrorRetail("canal inexistente", 404);
  if (body.quitar_app === true) throw new ErrorRetail("Instagram requiere la app propia del canal");
  const config = { ...(canal?.config as Record<string, unknown> ?? {}) };
  const nombre = String(body.nombre ?? canal?.nombre ?? "").trim();
  if (!nombre || nombre.length > 150) throw new ErrorRetail("nombre inválido");
  const instagramId = identificador(body.instagram_id ?? config.instagramId, "instagram_id");
  const pageId = identificador(body.page_id ?? config.pageId, "page_id");
  const appId = identificador(body.app_id || config.appId, "app_id");
  const filas = await dbRaw.$queryRaw<{ org: bigint | null }[]>`SELECT resolve_org_by_instagram(${instagramId}) AS org`;
  if (filas[0]?.org != null && !(canal?.activo && canal.orgId === filas[0].org && config.instagramId === instagramId)) {
    throw new ErrorRetail("esa cuenta de Instagram ya está conectada", 409);
  }
  actualizarSecreto(config, body.page_access_token, "token de página", "tokenEncrypted");
  actualizarSecreto(config, body.app_secret, "app_secret", "appSecretEncrypted");
  if (!config.tokenEncrypted || !config.appSecretEncrypted) throw new ErrorRetail("faltan el token de página y el App Secret del canal");
  Object.assign(config, { instagramId, pageId, appId });
  delete config.errorAutorizacion;
  try { await suscribirCuenta(config); }
  catch { throw new ErrorRetail("No se pudo suscribir la cuenta de Instagram en Facebook. Revisa los datos y permisos de la app.", 424); }
  try {
    const data = { nombre, config: config as Record<string, string>, estado: "conectado" as const };
    const guardado = canal ? await db.canalWhatsapp.update({ where: { id: canal.id }, data })
      : await db.canalWhatsapp.create({ data: { ...data, proveedor: "instagram", instancia: instagramId } });
    return { id: String(guardado.id), nombre: guardado.nombre, ok: true };
  } catch (e) {
    const error = e as { code?: string; meta?: { code?: string } };
    if (error.code === "P2002" || error.code === "23505" || error.meta?.code === "23505") {
      throw new ErrorRetail("esa cuenta de Instagram ya está conectada", 409);
    }
    throw e;
  }
}
