import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { db, dbRaw, runWithOrg } from "../../src/lib/db";
import {
  accionTarjeta,
  clientesAurum,
  conexionDe,
  ErrorAurum,
  llamarAurum,
  moduloLealtad,
  verificarCredenciales,
} from "../../src/lib/aurum";
import { buscarCliente } from "../../src/lib/lealtad";
import { encryptMetaToken } from "../../src/lib/meta/credentials";
import { POST as webhook } from "../../src/app/api/public/aurum/webhook/route";

// Prueba contra un Aurum REAL de pruebas (nunca producción):
//   AURUM_URL, AURUM_SLUG, AURUM_CLAVE (dueño), con una clienta de teléfono 9611234567
//   y una meta de 1 sello. Además DATABASE_URL (crm_app), META_TOKEN_ENCRYPTION_KEY
//   y AURUM_WEBHOOK_SECRET.
const SLUG = process.env.AURUM_SLUG!;
const CLAVE = process.env.AURUM_CLAVE!;
const SECRETO = process.env.AURUM_WEBHOOK_SECRET!;
const TELEFONO_CRM = "5219611234567";

function llamadaWebhook(cuerpo: unknown, clave = SECRETO) {
  return webhook(
    new NextRequest(`http://crm.test/api/public/aurum/webhook?clave=${encodeURIComponent(clave)}`, {
      method: "POST",
      body: JSON.stringify(cuerpo),
    }),
  );
}

async function guardarConexion(clave: string) {
  const modulo = (await moduloLealtad())!;
  await db.moduloOrg.update({
    where: { id: modulo.id },
    data: { config: { aurum: { slug: SLUG, claveCifrada: encryptMetaToken(clave), estado: "ok" } } },
  });
}

async function main() {
  assert.ok(SLUG && CLAVE && SECRETO && process.env.AURUM_URL, "faltan variables de la prueba");
  const org = await dbRaw.org.create({
    data: { id: BigInt(Date.now()), nombre: "Prueba lealtad", slug: `lealtad-${Date.now()}` },
  });

  // Credenciales: se verifican una vez al conectar.
  assert.equal(await verificarCredenciales(SLUG, "clave-incorrecta"), "La clave no es la del dueño de ese negocio");
  assert.equal(await verificarCredenciales("no-existe-xyz", CLAVE), "No existe ese negocio en Aurum");
  assert.equal(await verificarCredenciales(SLUG, CLAVE), null);

  const conv = await runWithOrg(org.id, async () => {
    await db.moduloOrg.create({ data: { clave: "lealtad", activo: true, config: {} } });
    await guardarConexion(CLAVE);
    const contacto = await db.contacto.create({ data: { nombre: "Ana López", telefono: TELEFONO_CRM } });
    const canal = await db.canalWhatsapp.create({
      data: { nombre: "Prueba", proveedor: "cloud_api", instancia: `prueba-${Date.now()}`, config: {} },
    });
    return db.conversacion.create({ data: { contactoId: contacto.id, canalId: canal.id } });
  });

  await runWithOrg(org.id, async () => {
    const conexion = conexionDe((await moduloLealtad())?.config)!;
    const cliente = buscarCliente(await clientesAurum(conexion, { fresco: true }), TELEFONO_CRM);
    assert.ok(cliente, "encuentra a la clienta de Aurum con el teléfono del CRM (521…)");
    const sello = await accionTarjeta(conexion, "stamp", cliente.token);
    assert.deepEqual(sello.earned.map((premio: { description: string }) => premio.description), ["Corte gratis"]);
  });

  // Webhook: secreto obligatorio; se enruta por slug y se re-verifica con Aurum.
  assert.equal((await llamadaWebhook({}, "secreto-falso")).status, 401);
  const evento = { event: "reward_earned", slug: SLUG, phone: "9611234567", name: "Ana López", earned: ["Corte gratis"] };
  const aviso = await (await llamadaWebhook(evento)).json();
  assert.deepEqual(aviso, { ok: true, avisado: false }, "ventana cerrada y sin plantilla: solo nota interna");
  const nota = await runWithOrg(org.id, () =>
    db.mensaje.findFirst({ where: { conversacionId: conv.id, interna: true }, orderBy: { id: "desc" } }),
  );
  assert.match(nota!.contenido ?? "", /Lealtad: .* ganó Corte gratis/);
  const otroNegocio = await (await llamadaWebhook({ ...evento, slug: "negocio-sin-conectar" })).json();
  assert.equal(otroNegocio.ignorado, "negocio sin conectar");

  // Canjear deja el premio en 0; un webhook repetido ya no avisa (Aurum manda la verdad).
  await runWithOrg(org.id, async () => {
    const conexion = conexionDe((await moduloLealtad())?.config)!;
    const cliente = buscarCliente(await clientesAurum(conexion, { fresco: true }), TELEFONO_CRM)!;
    const canje = await accionTarjeta(conexion, "redeem", cliente.token);
    assert.equal(canje.pending, 0);
  });
  const repetido = await (await llamadaWebhook(evento)).json();
  assert.equal(repetido.ignorado, "sin premio pendiente en Aurum");

  // Clave inválida: un 401 desactiva la conexión y ya no se vuelve a llamar a Aurum
  // (su bloqueo por IP afectaría a todas las empresas de AmbarCRM).
  await runWithOrg(org.id, async () => {
    await guardarConexion("clave-cambiada");
    const conexion = conexionDe((await moduloLealtad())?.config)!;
    await assert.rejects(clientesAurum(conexion, { fresco: true }), (error: ErrorAurum) => error.status === 409);
    const desactivada = conexionDe((await moduloLealtad())?.config)!;
    assert.equal(desactivada.estado, "error");
    await assert.rejects(
      llamarAurum(desactivada, `/api/${SLUG}/customers`),
      /vuelve a conectarla/,
    );
  });

  console.log("OK · lealtad contra Aurum real: conexión, sellos, premio, webhook, canje y 401");
}

main()
  .then(() => dbRaw.$disconnect())
  .catch(async (error) => {
    console.error("FALLO:", error);
    await dbRaw.$disconnect();
    process.exit(1);
  });
