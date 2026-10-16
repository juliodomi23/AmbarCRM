import assert from "node:assert/strict";
import { destinatarioDelCanal, responderTexto } from "../../src/lib/channel/destinatario";
import { getProvider, type ChannelProvider } from "../../src/lib/channel";
import { db, dbRaw, runWithOrg } from "../../src/lib/db";
import { ingestarEntrante } from "../../src/lib/services/ingest";

const recibidos: string[] = [];
const provider: ChannelProvider = {
  nombre: "api",
  async enviarTexto(destinatario, texto) {
    recibidos.push(`${destinatario}:${texto}`);
    return { ok: true, waMessageId: "respuesta-1" };
  },
  async enviarMedia() { return { ok: true }; },
  normalizarEntrante: () => [],
};
assert.equal((await responderTexto(provider, { telefono: null, identificadorExterno: "cliente-42" }, "respuesta del bot")).ok, true);
assert.deepEqual(recibidos, ["cliente-42:respuesta del bot"]);
assert.equal(destinatarioDelCanal("cloud_api", { telefono: "52155", identificadorExterno: "psid" }), "52155");
assert.equal(destinatarioDelCanal("messenger", { telefono: "52155", identificadorExterno: "psid" }), "psid");
assert.equal((await responderTexto(provider, { telefono: null }, "hola")).ok, false);
for (const nombre of ["cloud_api", "api", "messenger"]) assert.equal(getProvider(nombre).nombre, nombre);
console.log("OK · respuesta del bot sin teléfono mediante proveedor falso; destinatarios y despacho");

assert.equal(new URL(process.env.DATABASE_URL!).port, "55450", "solo BD desechable");
const org = await dbRaw.org.create({ data: { nombre: "Canales base", slug: `canales-base-${Date.now()}` } });
try {
  await runWithOrg(org.id, async () => {
    const a = await db.canalWhatsapp.create({ data: { nombre: "API A", proveedor: "api" } });
    const b = await db.canalWhatsapp.create({ data: { nombre: "API B", proveedor: "api" } });
    const entrada = { waMessageId: "mismo-id", identificadorExterno: "externo-1", tipo: "texto" as const, contenido: "hola", timestamp: new Date() };
    assert.equal((await ingestarEntrante(entrada, a.id)).duplicado, false);
    assert.equal((await ingestarEntrante(entrada, a.id)).duplicado, true);
    assert.equal((await ingestarEntrante(entrada, b.id)).duplicado, false);
    assert.equal(await db.contacto.count(), 2, "la identidad está acotada al canal");
    await ingestarEntrante({ ...entrada, waMessageId: "telefono-nuevo", telefono: "5215512345678" }, a.id);
    const contacto = await db.contacto.findFirstOrThrow({ where: { canalId: a.id } });
    assert.equal(contacto.telefono, "5215512345678");
    const wa = await db.canalWhatsapp.create({ data: { nombre: "WA", proveedor: "cloud_api" } });
    await ingestarEntrante({ waMessageId: "wa", telefono: contacto.telefono!, tipo: "texto", timestamp: new Date() }, wa.id);
    assert.equal(await db.contacto.count(), 2, "WhatsApp reutiliza el contacto que ya tiene teléfono");
    console.log("OK · identidad por canal, idempotencia y enlace posterior con teléfono");
  });
} finally {
  await runWithOrg(org.id, async () => {
    await db.oportunidad.deleteMany();
    await db.conversacion.deleteMany();
    await db.contacto.deleteMany();
    await db.canalWhatsapp.deleteMany();
    await db.ajustes.deleteMany();
    await db.etapa.deleteMany();
    await db.embudo.deleteMany();
  });
  await dbRaw.org.delete({ where: { id: org.id } });
  await dbRaw.$disconnect();
}
