import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db, runWithOrg } from "@/lib/db";
import { ErrorRetail } from "@/lib/retail-db";
import { decryptMetaToken, encryptMetaToken } from "@/lib/meta/credentials";
import { requireMetaAppCredentials } from "@/lib/meta/config";
import { instagramDePagina, paginasDeFacebook, validarPaginaFacebook, type PaginaFacebook, ERROR_PERMISOS_META } from "@/lib/meta/messenger-facebook";
import { guardarCanalInstagram, guardarCanalMessenger } from "@/lib/services/canales";

export const LOGIN_DURACION_MS = 10 * 60_000;
export const AVISO_APP_PROPIA = "Este canal usa una app propia de Meta. Usa la conexión manual para conservar sus credenciales.";
export type IdentidadLogin = { orgId: bigint; userId: bigint; sessionToken: string };
export type ProveedorLogin = "messenger" | "instagram";
const hash = (valor: string) => createHash("sha256").update(valor).digest("hex");

async function canalGlobal(id: bigint, proveedor: ProveedorLogin) {
  const canal = await db.canalWhatsapp.findFirst({ where: { id, proveedor, activo: true } });
  if (!canal) throw new ErrorRetail(`Canal de ${proveedor === "instagram" ? "Instagram" : "Messenger"} inexistente.`, 404);
  const config = canal.config as Record<string, unknown>;
  if (proveedor === "messenger" && (config.appId || config.appSecretEncrypted)) throw new ErrorRetail(AVISO_APP_PROPIA, 409);
  if (proveedor === "instagram" && config.appId !== requireMetaAppCredentials().appId) {
    throw new ErrorRetail("Este canal usa otra app de Meta. Usa la conexión manual para conservar sus credenciales.", 409);
  }
  return canal;
}

export async function iniciarMessengerLogin(identidad: IdentidadLogin, canalId?: bigint, proveedor: ProveedorLogin = "messenger") {
  return runWithOrg(identidad.orgId, async () => {
    if (canalId) await canalGlobal(canalId, proveedor);
    await db.messengerLogin.deleteMany({ where: { OR: [{ venceAt: { lte: new Date() } }, { proveedor, userId: identidad.userId, sessionHash: hash(identidad.sessionToken) }] } });
    const state = randomBytes(32).toString("hex");
    const id = randomUUID();
    await db.messengerLogin.create({ data: {
      id, proveedor, userId: identidad.userId, sessionHash: hash(identidad.sessionToken), stateHash: hash(state),
      canalId, venceAt: new Date(Date.now() + LOGIN_DURACION_MS),
    } });
    return { id, state };
  });
}

async function intentoValido(identidad: IdentidadLogin, id: string, state: unknown, proveedor: ProveedorLogin) {
  if (typeof state !== "string" || !/^[a-f0-9]{64}$/.test(state)) throw new ErrorRetail("Estado de conexión inválido. Vuelve a conectar con Facebook.", 403);
  const intento = await db.messengerLogin.findFirst({ where: {
    id, proveedor, userId: identidad.userId, sessionHash: hash(identidad.sessionToken), stateHash: hash(state), venceAt: { gt: new Date() },
  } });
  if (!intento) throw new ErrorRetail("La conexión venció o no pertenece a esta sesión. Vuelve a conectar con Facebook.", 403);
  return intento;
}

export async function listarPaginasMessenger(identidad: IdentidadLogin, id: string, state: unknown, code: unknown, proveedor: ProveedorLogin = "messenger") {
  return runWithOrg(identidad.orgId, async () => {
    const intento = await intentoValido(identidad, id, state, proveedor);
    if (typeof code !== "string" || !code || code.length > 8192) throw new ErrorRetail("Meta no devolvió un código válido.");
    if (intento.canalId) await canalGlobal(intento.canalId, proveedor);
    const tomado = await db.messengerLogin.updateMany({ where: { id, paginasEncrypted: null, venceAt: { gt: new Date() } }, data: { paginasEncrypted: "" } });
    if (tomado.count !== 1) throw new ErrorRetail("Este inicio de sesión ya fue utilizado. Vuelve a conectar.", 409);
    try {
      const paginas = await paginasDeFacebook(code);
      const actualizado = await db.messengerLogin.updateMany({ where: { id, venceAt: { gt: new Date() } }, data: { paginasEncrypted: encryptMetaToken(JSON.stringify(paginas)) } });
      if (actualizado.count !== 1) throw new ErrorRetail("La conexión venció. Vuelve a conectar.", 403);
      return paginas.map(({ id, nombre, foto }) => ({ id, nombre, foto }));
    } catch (error) {
      await db.messengerLogin.deleteMany({ where: { id } });
      throw error;
    }
  });
}

export async function conectarPaginaMessenger(identidad: IdentidadLogin, id: string, state: unknown, pageId: unknown, nombre?: unknown, proveedor: ProveedorLogin = "messenger") {
  return runWithOrg(identidad.orgId, async () => {
    const intento = await intentoValido(identidad, id, state, proveedor);
    if (!intento.paginasEncrypted) throw new ErrorRetail("Primero inicia sesión con Facebook.", 409);
    const paginas = JSON.parse(decryptMetaToken(intento.paginasEncrypted)) as PaginaFacebook[];
    const pagina = paginas.find((p) => p.id === pageId);
    if (!pagina) throw new ErrorRetail("La página no está entre las autorizadas por tu cuenta.", 403);
    if (nombre != null && (typeof nombre !== "string" || !nombre.trim() || nombre.trim().length > 150)) throw new ErrorRetail("Nombre de canal inválido.");
    const instagramId = proveedor === "instagram" ? await instagramDePagina(pagina) : null;
    const canal = intento.canalId ? await canalGlobal(intento.canalId, proveedor) : await db.canalWhatsapp.findFirst({
      where: { proveedor, activo: true, config: { path: [proveedor === "instagram" ? "instagramId" : "pageId"], equals: instagramId ?? pagina.id } },
    });
    if (canal) {
      await canalGlobal(canal.id, proveedor);
      if ((canal.config as Record<string, unknown>).pageId !== pagina.id) throw new ErrorRetail("Elige la página que ya pertenece a este canal.", 409);
      if (instagramId && (canal.config as Record<string, unknown>).instagramId !== instagramId) throw new ErrorRetail("La cuenta de Instagram vinculada cambió. Revisa el canal antes de reconectar.", 409);
    }
    const consumido = await db.messengerLogin.deleteMany({ where: { id, venceAt: { gt: new Date() } } });
    if (consumido.count !== 1) throw new ErrorRetail("La conexión ya fue utilizada o venció. Vuelve a conectar.", 403);
    await validarPaginaFacebook(pagina);
    try {
      if (proveedor === "instagram") {
        const { appId, appSecret } = requireMetaAppCredentials();
        return await guardarCanalInstagram({ instagram_id: instagramId, page_id: pagina.id, page_access_token: pagina.token,
          app_id: appId, app_secret: appSecret, nombre: nombre ?? canal?.nombre ?? pagina.nombre }, canal?.id, true);
      }
      return await guardarCanalMessenger({ page_id: pagina.id, page_access_token: pagina.token, nombre: nombre ?? canal?.nombre ?? pagina.nombre }, canal?.id, true);
    } catch (error) {
      if (error instanceof ErrorRetail && error.status === 424) throw new ErrorRetail(ERROR_PERMISOS_META, 424);
      throw error;
    }
  });
}
