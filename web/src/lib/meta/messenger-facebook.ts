import { META_GRAPH_URL, requireMetaAppCredentials } from "@/lib/meta/config";
import { ErrorRetail } from "@/lib/retail-db";

export type PaginaFacebook = { id: string; nombre: string; foto: string | null; token: string };
// business_management y pages_read_engagement son dependencias que Meta añade al caso de uso; el diálogo debe pedirlos para poder demostrarlos en la revisión.
export const PERMISOS_MESSENGER = "pages_show_list,pages_messaging,pages_manage_metadata,business_management";
export const PERMISOS_INSTAGRAM = "pages_show_list,instagram_basic,instagram_manage_messages,pages_manage_metadata,pages_read_engagement,business_management";

// Con Facebook Login para empresas el diálogo se define por config_id (permisos configurados en el panel); sin él se usa scope.
export function configIdLogin(proveedor: "messenger" | "instagram") {
  const id = (proveedor === "instagram" ? process.env.META_INSTAGRAM_CONFIG_ID : process.env.META_MESSENGER_CONFIG_ID)?.trim();
  return id && /^\d{1,30}$/.test(id) ? id : undefined;
}
export const ERROR_PERMISOS_META = "Tu cuenta no tiene permiso en la app de Meta; usa la conexión manual. En modo desarrollo solo pueden conectarse personas con rol en la app.";

async function graph(path: string, init: RequestInit) {
  const res = await fetch(`${META_GRAPH_URL}/${path}`, { ...init, cache: "no-store", signal: AbortSignal.timeout(8000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const permiso = [10, 200, 299].includes(Number(data.error?.code)) || res.status === 403;
    throw new ErrorRetail(permiso ? ERROR_PERMISOS_META : "Meta no pudo validar la conexión. Vuelve a iniciar sesión o usa la conexión manual.", 424);
  }
  return data;
}

async function intercambiar(params: Record<string, string>) {
  const { appId, appSecret } = requireMetaAppCredentials();
  const data = await graph("oauth/access_token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: appId, client_secret: appSecret, ...params }),
  });
  if (typeof data.access_token !== "string" || !data.access_token || data.access_token.length > 8192) {
    throw new ErrorRetail("Meta no devolvió una credencial válida. Usa la conexión manual.", 424);
  }
  return data.access_token as string;
}

function fotoPublica(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || /token|secret|code/i.test(url.search)) return null;
    if (!(url.hostname.endsWith(".fbcdn.net") || url.hostname.endsWith(".fbsbx.com"))) return null;
    return url.href;
  } catch { return null; }
}

export async function paginasDeFacebook(code: string): Promise<PaginaFacebook[]> {
  const corto = await intercambiar({ code });
  const token = await intercambiar({ grant_type: "fb_exchange_token", fb_exchange_token: corto });
  const paginas: PaginaFacebook[] = [];
  let cursor: string | undefined;
  for (let n = 0; n < 20; n++) {
    const params = new URLSearchParams({ fields: "id,name,access_token,picture", limit: "100", ...(cursor ? { after: cursor } : {}) });
    const data = await graph(`me/accounts?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!Array.isArray(data.data)) throw new ErrorRetail("Meta no devolvió la lista de páginas.", 424);
    for (const pagina of data.data) {
      if (typeof pagina.id !== "string" || !/^\d{1,40}$/.test(pagina.id) || typeof pagina.name !== "string" || typeof pagina.access_token !== "string" || !pagina.access_token || pagina.access_token.length > 8192) continue;
      paginas.push({ id: pagina.id, nombre: pagina.name.slice(0, 150), foto: fotoPublica(pagina.picture?.data?.url), token: pagina.access_token });
    }
    if (!data.paging?.next) return paginas;
    cursor = data.paging?.cursors?.after;
    if (typeof cursor !== "string" || cursor.length > 2048) break;
  }
  throw new ErrorRetail("Meta devolvió demasiadas páginas. Limita las páginas autorizadas y vuelve a conectar.", 424);
}

export async function validarPaginaFacebook(pagina: PaginaFacebook) {
  const data = await graph("me?fields=id", { headers: { Authorization: `Bearer ${pagina.token}` } });
  if (data.id !== pagina.id) throw new ErrorRetail("La credencial no corresponde a la página elegida. Vuelve a conectar.", 400);
}

export async function instagramDePagina(pagina: PaginaFacebook): Promise<string> {
  const data = await graph(`${pagina.id}?fields=instagram_business_account`, { headers: { Authorization: `Bearer ${pagina.token}` } });
  const id = data.instagram_business_account?.id;
  if (typeof id !== "string" || !/^\d{1,40}$/.test(id)) {
    throw new ErrorRetail("La página elegida no tiene una cuenta profesional de Instagram vinculada. Vincúlala en Meta y vuelve a conectar.", 409);
  }
  return id;
}
