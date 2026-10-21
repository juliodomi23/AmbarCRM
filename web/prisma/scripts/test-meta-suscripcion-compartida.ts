import assert from "node:assert/strict";
import { db, dbRaw, runWithOrg } from "../../src/lib/db";
import { guardarCanalInstagram, guardarCanalMessenger } from "../../src/lib/services/canales";
import { CAMPOS_MESSENGER, desuscribirPagina } from "../../src/lib/channel/messenger";
import { desuscribirCuenta } from "../../src/lib/channel/instagram";

assert.equal(new URL(process.env.DATABASE_URL!).port, "55450", "solo base desechable");
process.env.META_APP_ID = "123";
process.env.META_APP_SECRET = "meta-compartida-simulada";
const original = globalThis.fetch;
const operaciones: { metodo: string; campos: string[] }[] = [];
globalThis.fetch = async (input, init) => {
  assert.match(String(input), /^https:\/\/graph\.facebook\.com\/v\d+\.\d+\/\d+\/subscribed_apps$/);
  operaciones.push({ metodo: init?.method ?? "GET", campos: init?.body ? JSON.parse(String(init.body)).subscribed_fields : [] });
  return Response.json({ success: true });
};
const marca = String(Date.now());
const pagina = `${marca}9`;
const orgs = await Promise.all(["a", "b"].map((sufijo) => dbRaw.org.create({ data: { nombre: "Meta compartida", slug: `meta-compartida-${marca}-${sufijo}` } })));

try {
  const messenger = await runWithOrg(orgs[0].id, () => guardarCanalMessenger({ nombre: "Messenger", page_id: pagina, page_access_token: "token-simulado" }));
  assert.deepEqual(operaciones.at(-1)?.campos, CAMPOS_MESSENGER);
  const instagram = await runWithOrg(orgs[1].id, () => guardarCanalInstagram({ nombre: "Instagram", instagram_id: `${marca}8`, page_id: pagina,
    page_access_token: "token-simulado", app_id: "123", app_secret: "meta-compartida-simulada" }));
  assert.deepEqual(new Set(operaciones.at(-1)?.campos), new Set(CAMPOS_MESSENGER), "la segunda conexión conserva los campos de Messenger entre empresas");

  const ig = await runWithOrg(orgs[1].id, () => db.canalWhatsapp.findUniqueOrThrow({ where: { id: BigInt(instagram.id) } }));
  const antes = operaciones.length;
  const retiroIg = await desuscribirCuenta(ig.config as Record<string, unknown>, ig.id);
  assert.equal(retiroIg.desuscrito, false);
  assert.equal(operaciones.length, antes, "retirar Instagram no elimina la suscripción compartida");
  await runWithOrg(orgs[1].id, () => db.canalWhatsapp.delete({ where: { id: ig.id } }));

  const msg = await runWithOrg(orgs[0].id, () => db.canalWhatsapp.findUniqueOrThrow({ where: { id: BigInt(messenger.id) } }));
  assert.equal((await desuscribirPagina(msg.config as Record<string, unknown>, msg.id)).desuscrito, true);
  assert.equal(operaciones.at(-1)?.metodo, "DELETE", "solo el último canal retira la app de la página");
  await runWithOrg(orgs[0].id, () => db.canalWhatsapp.delete({ where: { id: msg.id } }));
  console.log("OK · página compartida entre empresas: unión de campos, retiro parcial sin DELETE y retiro del último con DELETE");
} finally {
  globalThis.fetch = original;
  await dbRaw.$disconnect();
}
