import assert from "node:assert/strict";
import { db, dbRaw, runWithOrg } from "../../src/lib/db";
import { guardarCanalMessenger } from "../../src/lib/services/canales";
import { iniciarMessengerLogin, listarPaginasMessenger, conectarPaginaMessenger, type IdentidadLogin } from "../../src/lib/services/messenger-login";
import { decryptMetaToken } from "../../src/lib/meta/credentials";
import { ErrorRetail } from "../../src/lib/retail-db";
import { graphSimulado } from "./meta-facebook-simulado.mjs";

assert.equal(new URL(process.env.DATABASE_URL!).port, "55450");
process.env.META_APP_ID = "123";
process.env.META_APP_SECRET = "secreto-meta-simulado";
const original = globalThis.fetch;
let llamadas = 0;
let alSuscribir: (() => Promise<void>) | undefined;
globalThis.fetch = async (input, init) => {
  llamadas++;
  if (String(input).endsWith("/subscribed_apps")) await alSuscribir?.();
  return graphSimulado(input, init);
};
const orgs = await Promise.all(["a", "b"].map((letra) => dbRaw.org.create({ data: { nombre: `Login ${letra}`, slug: `login-fb-${letra}-${Date.now()}` } })));
const a: IdentidadLogin = { orgId: orgs[0].id, userId: 1001n, sessionToken: "sesion-a" };
const b: IdentidadLogin = { orgId: orgs[1].id, userId: 1002n, sessionToken: "sesion-b" };
const rechaza = (status: number, texto?: RegExp) => (error: unknown) => error instanceof ErrorRetail && error.status === status && (!texto || texto.test(error.message));
const iniciar = () => iniciarMessengerLogin(a);
const filas = () => runWithOrg(a.orgId, () => db.messengerLogin.findMany());
const codigo = String(Date.now());

try {
  const intento = await iniciar();
  for (const state of [undefined, "", "f".repeat(64)]) {
    await assert.rejects(listarPaginasMessenger(a, intento.id, state, codigo), rechaza(403));
  }
  assert.equal(llamadas, 0, "state inválido no consulta Graph");
  assert.equal((await filas())[0].paginasEncrypted, null, "state inválido no guarda credenciales");
  await assert.rejects(listarPaginasMessenger(b, intento.id, intento.state, codigo), rechaza(403));
  await assert.rejects(listarPaginasMessenger({ ...a, sessionToken: "otra-sesion" }, intento.id, intento.state, codigo), rechaza(403));
  await assert.rejects(listarPaginasMessenger({ ...a, userId: 1003n }, intento.id, intento.state, codigo), rechaza(403));
  await runWithOrg(b.orgId, async () => assert.equal(await db.messengerLogin.count(), 0));
  const lista = await listarPaginasMessenger(a, intento.id, intento.state, codigo);
  assert.deepEqual(Object.keys(lista[0]).sort(), ["foto", "id", "nombre"]);
  for (const privado of ["access_token", "usuario-corto", "usuario-largo", "pagina-privada", "token", "secreto-meta"]) assert.ok(!JSON.stringify(lista).includes(privado));
  const guardado = (await filas())[0];
  assert.ok(guardado.paginasEncrypted?.startsWith("encv1:"));
  assert.ok(!guardado.paginasEncrypted?.includes("pagina-privada"));
  assert.ok(guardado.venceAt.getTime() <= Date.now() + 600_000);
  await assert.rejects(listarPaginasMessenger(a, intento.id, intento.state, codigo), rechaza(409));
  await assert.rejects(conectarPaginaMessenger(a, intento.id, intento.state, "999999"), rechaza(403, /autorizadas/));
  await assert.rejects(conectarPaginaMessenger(b, intento.id, intento.state, lista[0].id), rechaza(403));
  await assert.rejects(conectarPaginaMessenger(a, intento.id, undefined, lista[0].id), rechaza(403));
  const canal = await conectarPaginaMessenger(a, intento.id, intento.state, lista[0].id);
  assert.equal((await filas()).length, 0, "conectar consume los tokens temporales");
  await assert.rejects(conectarPaginaMessenger(a, intento.id, intento.state, lista[0].id), rechaza(403));
  await runWithOrg(a.orgId, async () => {
    const c = await db.canalWhatsapp.findUniqueOrThrow({ where: { id: BigInt(canal.id) } });
    const config = c.config as Record<string, string>;
    assert.equal(decryptMetaToken(config.tokenEncrypted), `pagina-privada-${lista[0].id}`);
    await db.canalWhatsapp.update({ where: { id: c.id }, data: { estado: "desconectado", config: { ...config, errorAutorizacion: "Token vencido" } } });
  });
  const reconexion = await iniciarMessengerLogin(a, BigInt(canal.id));
  await listarPaginasMessenger(a, reconexion.id, reconexion.state, codigo);
  await assert.rejects(conectarPaginaMessenger(a, reconexion.id, reconexion.state, lista[1].id), rechaza(409, /misma|pertenece/));
  const reactivado = await conectarPaginaMessenger(a, reconexion.id, reconexion.state, lista[0].id, "Reconectada");
  assert.equal(reactivado.id, canal.id);
  await runWithOrg(a.orgId, async () => {
    assert.equal(await db.canalWhatsapp.count(), 1);
    const c = await db.canalWhatsapp.findUniqueOrThrow({ where: { id: BigInt(canal.id) } });
    assert.equal(c.estado, "conectado");
    assert.ok(!(c.config as Record<string, unknown>).errorAutorizacion);
  });
  const cambioConcurrente = await iniciar();
  await listarPaginasMessenger(a, cambioConcurrente.id, cambioConcurrente.state, codigo);
  alSuscribir = () => runWithOrg(a.orgId, async () => {
    const c = await db.canalWhatsapp.findUniqueOrThrow({ where: { id: BigInt(canal.id) } });
    await db.canalWhatsapp.update({ where: { id: c.id }, data: { config: { ...(c.config as Record<string, string>), appId: "456" } } });
  });
  await assert.rejects(conectarPaginaMessenger(a, cambioConcurrente.id, cambioConcurrente.state, lista[0].id), rechaza(409, /cambió/));
  alSuscribir = undefined;
  await runWithOrg(a.orgId, () => guardarCanalMessenger({ quitar_app: true }, BigInt(canal.id)));
  const duplicado = await iniciarMessengerLogin(b);
  await listarPaginasMessenger(b, duplicado.id, duplicado.state, codigo);
  await assert.rejects(conectarPaginaMessenger(b, duplicado.id, duplicado.state, lista[0].id), rechaza(409, /ya está conectada/));
  await runWithOrg(b.orgId, async () => assert.equal(await db.canalWhatsapp.count(), 0));

  const vencido = await iniciar();
  await runWithOrg(a.orgId, () => db.messengerLogin.update({ where: { id: vencido.id }, data: { venceAt: new Date(Date.now() - 1) } }));
  await assert.rejects(listarPaginasMessenger(a, vencido.id, vencido.state, codigo), rechaza(403));
  const venceConPaginas = await iniciar();
  await listarPaginasMessenger(a, venceConPaginas.id, venceConPaginas.state, codigo);
  await runWithOrg(a.orgId, () => db.messengerLogin.update({ where: { id: venceConPaginas.id }, data: { venceAt: new Date(Date.now() - 1) } }));
  await assert.rejects(conectarPaginaMessenger(a, venceConPaginas.id, venceConPaginas.state, lista[0].id), rechaza(403));

  const permisos = await iniciar();
  await assert.rejects(listarPaginasMessenger(a, permisos.id, permisos.state, "permisos"), (error: unknown) =>
    error instanceof ErrorRetail && /no tiene permiso.*conexión manual/.test(error.message) && !error.message.includes("TOKEN-SECRETO"));
  assert.equal((await filas()).length, 0);
  const propio = await runWithOrg(a.orgId, () => guardarCanalMessenger({ nombre: "Propia", page_id: `${codigo}3`, page_access_token: "token-manual", app_id: "456", app_secret: "secreto-propio" }));
  const antes = llamadas;
  await assert.rejects(iniciarMessengerLogin(a, BigInt(propio.id)), rechaza(409, /app propia.*manual/));
  assert.equal(llamadas, antes);
  const intentoPropio = await iniciar();
  await listarPaginasMessenger(a, intentoPropio.id, intentoPropio.state, codigo);
  await runWithOrg(a.orgId, () => guardarCanalMessenger({ app_id: "456", app_secret: "secreto-propio" }, BigInt(canal.id)));
  await assert.rejects(conectarPaginaMessenger(a, intentoPropio.id, intentoPropio.state, lista[0].id), rechaza(409, /app propia.*manual/));

  const paginasMultiples = await iniciar();
  assert.equal((await listarPaginasMessenger(a, paginasMultiples.id, paginasMultiples.state, "paginacion")).length, 2, "pagina siguiendo cursor, nunca paging.next con token");
  const carrera = await iniciar();
  await listarPaginasMessenger(a, carrera.id, carrera.state, codigo);
  const concurrentes = await Promise.allSettled([1, 2].map(() => conectarPaginaMessenger(a, carrera.id, carrera.state, lista[1].id)));
  assert.equal(concurrentes.filter((r) => r.status === "fulfilled").length, 1, "un intento solo conecta una vez bajo concurrencia");
  assert.equal(concurrentes.filter((r) => r.status === "rejected").length, 1);
  console.log("OK · Facebook simulado: intercambio POST sin credenciales en URL, lista pública, cifrado, CSRF, sesión/usuario/empresa, vencimiento, selección, 409, reconexión, app propia, permisos, paginación y consumo concurrente");
} finally {
  globalThis.fetch = original;
  for (const org of orgs) await runWithOrg(org.id, async () => {
    await db.messengerLogin.deleteMany();
    await db.canalWhatsapp.updateMany({ data: { activo: false } });
  });
  await dbRaw.$disconnect();
}
