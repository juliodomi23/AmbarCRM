/**
 * Webhook de Meta con canales conectados a mano: un canal con App Secret propio acepta mensajes
 * firmados con ese secreto aunque no coincida el global; una firma equivocada nunca se procesa.
 *
 * DATABASE_URL=<crm_app> META_TOKEN_ENCRYPTION_KEY=<base64 32 bytes> npx tsx prisma/scripts/test-webhook-manual.ts
 * Solo contra una BD desechable.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { db, dbRaw, runWithOrg } from "../../src/lib/db";
import { encryptMetaToken } from "../../src/lib/meta/credentials";
import { POST } from "../../src/app/api/meta/webhook/route";

const SECRETO_GLOBAL = "a".repeat(32);
const SECRETO_CANAL = "b".repeat(32);
process.env.META_APP_SECRET = SECRETO_GLOBAL;

const sufijo = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const phoneId = `9${sufijo}`.slice(0, 16);

function cuerpo(telefonoPhoneId: string, waId: string) {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{
      id: "1",
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "5215500000000", phone_number_id: telefonoPhoneId },
          contacts: [{ profile: { name: "Cliente Manual" }, wa_id: "5215512345678" }],
          messages: [{ from: "5215512345678", id: waId, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "hola" } }]
        }
      }]
    }]
  });
}

function firmar(secreto: string, raw: string) {
  return `sha256=${createHmac("sha256", secreto).update(raw).digest("hex")}`;
}

async function enviar(raw: string, firma: string) {
  const respuesta = await POST(new NextRequest("http://localhost/api/meta/webhook", {
    method: "POST",
    body: raw,
    headers: { "content-type": "application/json", "x-hub-signature-256": firma }
  }));
  return { status: respuesta.status, datos: await respuesta.json().catch(() => ({})) };
}

async function main() {
  const org = await dbRaw.org.create({ data: { id: BigInt(sufijo), nombre: "Webhook manual", slug: `webhook-manual-${sufijo}` } });
  await runWithOrg(org.id, () => db.canalWhatsapp.create({
    data: {
      nombre: "Manual",
      proveedor: "cloud_api",
      instancia: phoneId,
      estado: "conectado",
      config: { phoneNumberId: phoneId, wabaId: "1", onboardingMode: "manual", tokenEncrypted: encryptMetaToken("token"), appSecretEncrypted: encryptMetaToken(SECRETO_CANAL) }
    }
  }));

  const conCanal = cuerpo(phoneId, `wamid.canal.${sufijo}`);
  const r1 = await enviar(conCanal, firmar(SECRETO_CANAL, conCanal));
  assert.equal(r1.status, 200, "firmado con el App Secret del canal manual se acepta");
  assert.equal(r1.datos.procesados, 1);

  const malo = cuerpo(phoneId, `wamid.malo.${sufijo}`);
  assert.equal((await enviar(malo, firmar("c".repeat(32), malo))).status, 401, "un secreto equivocado se rechaza");

  const global = cuerpo(phoneId, `wamid.global.${sufijo}`);
  const r3 = await enviar(global, firmar(SECRETO_GLOBAL, global));
  assert.equal(r3.status, 200, "la firma global sigue funcionando");
  assert.equal(r3.datos.procesados, 1);

  const desconocido = cuerpo("1111111111", `wamid.desconocido.${sufijo}`);
  assert.equal((await enviar(desconocido, firmar(SECRETO_CANAL, desconocido))).status, 401, "número desconocido sin firma global");

  const guardados = await runWithOrg(org.id, () => db.mensaje.count({ where: { waMessageId: { contains: sufijo } } }));
  assert.equal(guardados, 2, "solo se guardaron los dos mensajes con firma válida");
  console.log("OK · webhook: firma del canal manual aceptada, firma equivocada rechazada, firma global intacta");
}

main()
  .catch((error) => {
    console.error("FALLO:", error);
    process.exitCode = 1;
  })
  .finally(() => Promise.all([db.$disconnect(), dbRaw.$disconnect()]));
