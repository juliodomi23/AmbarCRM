import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { NextRequest } from "next/server";
import { encryptMetaToken } from "../../src/lib/meta/credentials";
import { ERROR_DESCONEXION_MESSENGER } from "../../src/lib/channel/messenger";
import { META_GRAPH_URL } from "../../src/lib/meta/config";

const conexion = new URL(process.env.DATABASE_URL!);
assert.ok(["localhost", "127.0.0.1"].includes(conexion.hostname));
assert.equal(conexion.port, "55450");
const require = createRequire(import.meta.url);
const { db, dbRaw, runWithOrg }: typeof import("../../src/lib/db") = require("../../src/lib/db.ts");
const auth = require("next-auth/next");
const sesionOriginal = auth.getServerSession;
const fetchOriginal = globalThis.fetch;
const consolaOriginal = { log: console.log, warn: console.warn, error: console.error };
const registros: unknown[][] = [];
const marca = String(Date.now());
const token = `TOKEN-PRIVADO-DESCONEXION-${marca}`;
const cuerpoMeta = `CUERPO-PRIVADO-META-${marca}`;
const motivoForzado = "Se retiró del CRM, pero la suscripción puede seguir activa en Facebook: quita la app desde la configuración de la página";
const cifrado = encryptMetaToken(token);
const empresas = await Promise.all(["A", "B"].map((nombre) => dbRaw.org.create({ data: { nombre, slug: `desconexion-${nombre}-${marca}` } })));
let sesion: { user: { id: string; orgId: string; rol: string } } | null = { user: { id: "1001", orgId: String(empresas[0].id), rol: "admin" } };
let destino = "";
let llamadas = 0;
let secuencia = 0;
let responderGraph: () => Response = () => Response.json({ success: true });
auth.getServerSession = async () => sesion;
const { DELETE }: typeof import("../../src/app/api/canales/[id]/route") = require("../../src/app/api/canales/[id]/route.ts");
globalThis.fetch = async (input, init) => {
  assert.equal(String(input), `${META_GRAPH_URL}/${destino}/subscribed_apps`);
  assert.equal(init?.method, "DELETE");
  assert.ok(!String(input).includes(token));
  assert.ok(new Headers(init?.headers).get("authorization") === `Bearer ${token}`);
  llamadas++;
  return responderGraph();
};
for (const metodo of ["log", "warn", "error"] as const) console[metodo] = (...args: unknown[]) => { registros.push(args); };

async function crear(org = empresas[0], proveedor: "messenger" | "api" | "cloud_api" = "messenger") {
  return runWithOrg(org.id, async () => {
    const pageId = `${marca}${++secuencia}`;
    const canal = await db.canalWhatsapp.create({ data: { nombre: `Página de prueba ${secuencia}`, proveedor,
      config: { pageId, wabaId: pageId, tokenEncrypted: cifrado }, estado: "conectado" } });
    const contacto = await db.contacto.create({ data: { nombre: "Contacto de prueba" } });
    const conversacion = await db.conversacion.create({ data: { contactoId: contacto.id, canalId: canal.id } });
    const mensaje = await db.mensaje.create({ data: { conversacionId: conversacion.id, direccion: "entrante", contenido: "Historial de prueba" } });
    return { canal, conversacion, mensaje, pageId, org };
  });
}

async function borrar(id: bigint, borrarDatos?: boolean, forzar?: unknown) {
  const peticion = new NextRequest(`http://127.0.0.1/api/canales/${id}`, {
    method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ borrarDatos, forzar }),
  });
  const ejecutar = () => DELETE(peticion, { params: Promise.resolve({ id: String(id) }) });
  const respuesta = sesion ? await runWithOrg(BigInt(sesion.user.orgId), ejecutar) : await ejecutar();
  assert.ok(respuesta);
  const texto = await respuesta.text();
  for (const privado of [token, cifrado, cuerpoMeta, "tokenEncrypted", "access_token"]) assert.ok(!texto.includes(privado), "no expone credenciales ni errores de Meta en la respuesta");
  return { status: respuesta.status, datos: JSON.parse(texto) };
}

async function existe(fixture: Awaited<ReturnType<typeof crear>>) {
  return runWithOrg(fixture.org.id, () => db.canalWhatsapp.count({ where: { id: fixture.canal.id } }));
}

try {
  const propio = await crear();
  const ajeno = await crear(empresas[1]);
  const previas = llamadas;
  sesion = null;
  assert.equal((await borrar(propio.canal.id, true, true)).status, 401);
  sesion = { user: { id: "1001", orgId: String(empresas[0].id), rol: "agente" } };
  assert.equal((await borrar(propio.canal.id, true, true)).status, 403);
  sesion.user.rol = "admin";
  assert.equal((await borrar(ajeno.canal.id, true, true)).status, 404);
  assert.equal(llamadas, previas, "sin permiso o con canal ajeno no consulta Graph");
  assert.equal(await existe(propio), 1);
  assert.equal(await existe(ajeno), 1);

  destino = propio.pageId;
  assert.deepEqual(await borrar(propio.canal.id), { status: 200, datos: { ok: true, desuscrito: true } });
  assert.equal(await existe(propio), 0);
  await runWithOrg(propio.org.id, async () => {
    const conversacion = await db.conversacion.findUniqueOrThrow({ where: { id: propio.conversacion.id } });
    assert.equal(conversacion.canalId, null);
    assert.equal(await db.mensaje.count({ where: { id: propio.mensaje.id } }), 1);
  });

  const conBorrado = await crear();
  destino = conBorrado.pageId;
  assert.deepEqual(await borrar(conBorrado.canal.id, true), { status: 200, datos: { ok: true, desuscrito: true, borrados: { conversaciones: 1, grupos: 0 } } });
  await runWithOrg(conBorrado.org.id, async () => {
    assert.equal(await db.conversacion.count({ where: { id: conBorrado.conversacion.id } }), 0);
    assert.equal(await db.mensaje.count({ where: { id: conBorrado.mensaje.id } }), 0);
  });

  const definitivos = [
    { code: 190, status: 400, motivo: /token.*venció o fue revocado/ },
    { code: 0, status: 400, message: "The session has been invalidated", motivo: /token.*venció o fue revocado/ },
    { code: 803, status: 400, motivo: /página ya no está disponible/ },
    { code: 0, status: 404, motivo: /página ya no está disponible/ },
  ];
  for (const caso of definitivos) {
    const fixture = await crear();
    destino = fixture.pageId;
    responderGraph = () => Response.json({ error: { code: caso.code, message: `${caso.message ?? "Error de Meta"} ${token}` } }, { status: caso.status });
    const resultado = await borrar(fixture.canal.id);
    assert.equal(resultado.status, 200);
    assert.equal(resultado.datos.desuscrito, false);
    assert.match(resultado.datos.motivo, caso.motivo);
    assert.equal(await existe(fixture), 0);
    assert.equal(await runWithOrg(fixture.org.id, () => db.mensaje.count({ where: { id: fixture.mensaje.id } })), 1);
  }

  const transitorios: (() => Response)[] = [
    () => Response.json({ error: { code: 2, message: token } }, { status: 503 }),
    () => Response.json({ error: { code: 190, message: token } }, { status: 500 }),
    () => Response.json({ error: { code: 190, message: token } }, { status: 429 }),
    () => { throw new TypeError(`Red caída ${token}`); },
    () => { throw new DOMException(`Timeout ${token}`, "TimeoutError"); },
    () => Response.json({ error: { code: 200, message: `${cuerpoMeta} ${token}` } }, { status: 403 }),
    () => Response.json({ error: { code: 100, message: token } }, { status: 400 }),
    () => Response.json({ error: { code: 100, error_subcode: 33, message: `Object does not exist, cannot be loaded due to missing permissions ${token}` } }, { status: 400 }),
    () => Response.json({ success: false }),
    () => new Response("respuesta inválida", { status: 200 }),
  ];
  for (const respuesta of transitorios) {
    const fixture = await crear();
    destino = fixture.pageId;
    responderGraph = respuesta;
    assert.deepEqual(await borrar(fixture.canal.id, true), { status: 502, datos: { error: ERROR_DESCONEXION_MESSENGER } });
    assert.equal(await existe(fixture), 1);
    await runWithOrg(fixture.org.id, async () => {
      assert.equal((await db.conversacion.findUniqueOrThrow({ where: { id: fixture.conversacion.id } })).canalId, fixture.canal.id);
      assert.equal(await db.mensaje.count({ where: { id: fixture.mensaje.id } }), 1);
    });
    responderGraph = () => Response.json({ success: true });
    const reintento = await borrar(fixture.canal.id);
    assert.equal(reintento.datos.desuscrito, true);
    assert.equal(await existe(fixture), 0);
  }

  for (const respuesta of transitorios) {
    for (const borrarDatos of [false, true]) {
      const fixture = await crear();
      destino = fixture.pageId;
      responderGraph = respuesta;
      const previas = llamadas;
      assert.deepEqual(await borrar(fixture.canal.id, borrarDatos, true), {
        status: 200,
        datos: { ok: true, desuscrito: false, forzado: true, motivo: motivoForzado,
          ...(borrarDatos ? { borrados: { conversaciones: 1, grupos: 0 } } : {}) },
      });
      assert.equal(llamadas, previas + 1, "el retiro forzado intenta cancelar la suscripción remota");
      assert.equal(await existe(fixture), 0);
      await runWithOrg(fixture.org.id, async () => {
        const conversacion = await db.conversacion.findUnique({ where: { id: fixture.conversacion.id } });
        assert.equal(conversacion?.canalId, borrarDatos ? undefined : null);
        assert.equal(await db.mensaje.count({ where: { id: fixture.mensaje.id } }), borrarDatos ? 0 : 1);
      });
    }
  }

  const estricto = await crear();
  destino = estricto.pageId;
  responderGraph = () => Response.json({ error: { code: 200, message: `${cuerpoMeta} ${token}` } }, { status: 403 });
  for (const valor of [false, "true", 1, null]) {
    assert.equal((await borrar(estricto.canal.id, false, valor)).status, 502);
    assert.equal(await existe(estricto), 1, "solo el booleano true permite el retiro forzado");
  }
  responderGraph = () => Response.json({ success: true });
  assert.deepEqual(await borrar(estricto.canal.id, false, true), { status: 200, datos: { ok: true, desuscrito: true } });

  const api = await crear(empresas[0], "api");
  const antesApi = llamadas;
  assert.deepEqual(await borrar(api.canal.id, false, true), { status: 200, datos: { ok: true } });
  assert.equal(llamadas, antesApi, "API no ejecuta desuscripción remota");
  const whatsapp = await crear(empresas[0], "cloud_api");
  destino = whatsapp.pageId;
  assert.deepEqual(await borrar(whatsapp.canal.id, false, true), { status: 200, datos: { ok: true } });
  assert.equal(llamadas, antesApi + 1, "WhatsApp conserva su DELETE remoto y respuesta");
  const whatsappFallido = await crear(empresas[0], "cloud_api");
  destino = whatsappFallido.pageId;
  responderGraph = () => Response.json({ error: { message: "No permitido" } }, { status: 403 });
  assert.deepEqual(await borrar(whatsappFallido.canal.id, true, true), { status: 502, datos: { error: "No permitido" } });
  assert.equal(await existe(whatsappFallido), 1, "forzar no evita errores de WhatsApp");
  assert.equal(await runWithOrg(whatsappFallido.org.id, () => db.mensaje.count({ where: { id: whatsappFallido.mensaje.id } })), 1);

  const bitacoras = await Promise.all(empresas.map(org => runWithOrg(org.id, async () => ({ auditoria: await db.auditoriaBot.findMany(), eventos: await db.evento.findMany() }))));
  const textoBitacoras = JSON.stringify({ bitacoras, registros }, (_clave, valor) => typeof valor === "bigint" ? String(valor) : valor);
  for (const privado of [token, cifrado, cuerpoMeta, "tokenEncrypted", "access_token"]) assert.ok(!textoBitacoras.includes(privado), "no expone credenciales ni errores de Meta en bitácoras ni consola");
  Object.assign(console, consolaOriginal);
  console.log(JSON.stringify({ prueba: "desconexion-messenger", exito: true, historialConservado: true, borradoExplicito: true, erroresDefinitivos: definitivos.length, fallosReintentables: transitorios.length, retirosForzados: transitorios.length * 2, forzarBooleanoEstricto: true, sinSesion: 401, agente: 403, empresaAjena: 404, credencialesExpuestas: false, erroresMetaExpuestos: false, whatsappYApiSinCambios: true }));
} finally {
  Object.assign(console, consolaOriginal);
  auth.getServerSession = sesionOriginal;
  globalThis.fetch = fetchOriginal;
  try {
    for (const org of empresas) {
      await runWithOrg(org.id, async () => {
        await db.mensaje.deleteMany(); await db.conversacion.deleteMany();
        await db.contacto.deleteMany(); await db.canalWhatsapp.deleteMany();
      });
      await dbRaw.org.delete({ where: { id: org.id } });
    }
  } finally { await dbRaw.$disconnect(); }
}
