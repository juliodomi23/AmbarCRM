import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db, runWithOrg } from "@/lib/db";
import { ErrorRetail } from "@/lib/retail-db";
import { decryptMetaToken, encryptMetaToken } from "@/lib/meta/credentials";
import { paginasDeFacebook, validarPaginaFacebook, type PaginaFacebook, ERROR_PERMISOS_META } from "@/lib/meta/messenger-facebook";
import { guardarCanalMessenger } from "@/lib/services/canales";

export const LOGIN_DURACION_MS = 10 * 60_000;
export const AVISO_APP_PROPIA = "Este canal usa una app propia de Meta. Usa la conexión manual para conservar sus credenciales.";
export type IdentidadLogin = { orgId: bigint; userId: bigint; sessionToken: string };
const hash = (valor: string) => createHash("sha256").update(valor).digest("hex");

async function canalGlobal(id: bigint) {
  const canal = await db.canalWhatsapp.findFirst({ where: { id, proveedor: "messenger", activo: true } });
  if (!canal) throw new ErrorRetail("Canal de Messenger inexistente.", 404);
  const config = canal.config as Record<string, unknown>;
  if (config.appId || config.appSecretEncrypted) throw new ErrorRetail(AVISO_APP_PROPIA, 409);
  return canal;
}

export async function iniciarMessengerLogin(identidad: IdentidadLogin, canalId?: bigint) {
  return runWithOrg(identidad.orgId, async () => {
    if (canalId) await canalGlobal(canalId);
    await db.messengerLogin.deleteMany({ where: { OR: [{ venceAt: { lte: new Date() } }, { userId: identidad.userId, sessionHash: hash(identidad.sessionToken) }] } });
    const state = randomBytes(32).toString("hex");
    const id = randomUUID();
    await db.messengerLogin.create({ data: {
      id, userId: identidad.userId, sessionHash: hash(identidad.sessionToken), stateHash: hash(state),
      canalId, venceAt: new Date(Date.now() + LOGIN_DURACION_MS),
    } });
    return { id, state };
  });
}

async function intentoValido(identidad: IdentidadLogin, id: string, state: unknown) {
  if (typeof state !== "string" || !/^[a-f0-9]{64}$/.test(state)) throw new ErrorRetail("Estado de conexión inválido. Vuelve a conectar con Facebook.", 403);
  const intento = await db.messengerLogin.findFirst({ where: {
    id, userId: identidad.userId, sessionHash: hash(identidad.sessionToken), stateHash: hash(state), venceAt: { gt: new Date() },
  } });
  if (!intento) throw new ErrorRetail("La conexión venció o no pertenece a esta sesión. Vuelve a conectar con Facebook.", 403);
  return intento;
}

export async function listarPaginasMessenger(identidad: IdentidadLogin, id: string, state: unknown, code: unknown) {
  return runWithOrg(identidad.orgId, async () => {
    const intento = await intentoValido(identidad, id, state);
    if (typeof code !== "string" || !code || code.length > 8192) throw new ErrorRetail("Meta no devolvió un código válido.");
    if (intento.canalId) await canalGlobal(intento.canalId);
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

export async function conectarPaginaMessenger(identidad: IdentidadLogin, id: string, state: unknown, pageId: unknown, nombre?: unknown) {
  return runWithOrg(identidad.orgId, async () => {
    const intento = await intentoValido(identidad, id, state);
    if (!intento.paginasEncrypted) throw new ErrorRetail("Primero inicia sesión con Facebook.", 409);
    const paginas = JSON.parse(decryptMetaToken(intento.paginasEncrypted)) as PaginaFacebook[];
    const pagina = paginas.find((p) => p.id === pageId);
    if (!pagina) throw new ErrorRetail("La página no está entre las autorizadas por tu cuenta.", 403);
    if (nombre != null && (typeof nombre !== "string" || !nombre.trim() || nombre.trim().length > 150)) throw new ErrorRetail("Nombre de canal inválido.");
    const canal = intento.canalId ? await canalGlobal(intento.canalId) : await db.canalWhatsapp.findFirst({
      where: { proveedor: "messenger", activo: true, config: { path: ["pageId"], equals: pagina.id } },
    });
    if (canal) {
      await canalGlobal(canal.id);
      if ((canal.config as Record<string, unknown>).pageId !== pagina.id) throw new ErrorRetail("Elige la página que ya pertenece a este canal.", 409);
    }
    const consumido = await db.messengerLogin.deleteMany({ where: { id, venceAt: { gt: new Date() } } });
    if (consumido.count !== 1) throw new ErrorRetail("La conexión ya fue utilizada o venció. Vuelve a conectar.", 403);
    await validarPaginaFacebook(pagina);
    try {
      return await guardarCanalMessenger({ page_id: pagina.id, page_access_token: pagina.token, nombre: nombre ?? canal?.nombre ?? pagina.nombre }, canal?.id);
    } catch (error) {
      if (error instanceof ErrorRetail && error.status === 502) throw new ErrorRetail(ERROR_PERMISOS_META, 502);
      throw error;
    }
  });
}
