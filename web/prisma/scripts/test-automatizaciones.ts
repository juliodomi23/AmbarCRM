import assert from "node:assert/strict";
import { createRequire, syncBuiltinESMExports } from "node:module";
import https from "node:https";
import { EventEmitter } from "node:events";
import { NextRequest } from "next/server";
import { db, dbRaw, runWithOrg } from "../../src/lib/db";
import { guardarRegla } from "../../src/lib/services/reglas-automatizacion";
import { ejecutarReglas } from "../../src/lib/automatizaciones";
import { cumpleCondiciones, validarAcciones, validarCondiciones, type CondicionRegla } from "../../src/lib/automatizaciones-esquema";
import { dispararEvento, esperarReglas } from "../../src/lib/disparar-evento";
import { esperarWebhooks } from "../../src/lib/webhooks-salientes";
import { encryptMetaToken } from "../../src/lib/meta/credentials";
import { ingestarEntrante } from "../../src/lib/services/ingest";
import { actualizarConversacion } from "../../src/lib/services/conversacion-estado";

assert.equal(new URL(process.env.DATABASE_URL!).port, "55450");
assert.ok(["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL!).hostname));
const base = { canal: "api", estado: "abierta", etiquetas: ["1"], texto: "Hola CITA", fueraHorario: true, contactoNuevo: true };
const casos: [CondicionRegla, Partial<typeof base>][] = [
  [{ tipo: "canal", valor: "api" }, { canal: "messenger" }],
  [{ tipo: "estado", valor: "abierta" }, { estado: "cerrada" }],
  [{ tipo: "etiqueta", valor: "1" }, { etiquetas: [] }],
  [{ tipo: "texto_contiene", valor: "cita" }, { texto: "hola" }],
  [{ tipo: "texto_no_contiene", valor: "precio" }, { texto: "PRECIO" }],
  [{ tipo: "fuera_horario", valor: true }, { fueraHorario: false }],
  [{ tipo: "contacto_nuevo", valor: true }, { contactoNuevo: false }],
];
for (const [c, cambio] of casos) {
  assert.equal(cumpleCondiciones([c], base), true, c.tipo);
  assert.equal(cumpleCondiciones([c], { ...base, ...cambio }), false, c.tipo);
}
assert.equal(cumpleCondiciones(casos.map(([c]) => c), base), true);
assert.equal(cumpleCondiciones(casos.map(([c]) => c), { ...base, contactoNuevo: false }), false, "AND");
for (const c of [[{ tipo: "eval", valor: "process.exit()" }], [{ tipo: "contacto_nuevo", valor: "true" }], [{ tipo: "canal", valor: "api", extra: 1 }]]) assert.throws(() => validarCondiciones(c));
assert.throws(() => validarAcciones([{ tipo: "http", url: "https://8.8.8.8" }]));
assert.throws(() => validarAcciones(Array.from({ length: 6 }, () => ({ tipo: "cambiar_estado", valor: "abierta" }))));

const require = createRequire(import.meta.url);
const auth = require("next-auth/next");
const originalAuth = auth.getServerSession;
let sesion: { user: { id: string; orgId: string; rol: string } } | null = null;
auth.getServerSession = async () => sesion;
const rutas: typeof import("../../src/app/api/automatizaciones/route") = require("../../src/app/api/automatizaciones/route.ts");
const detalle: typeof import("../../src/app/api/automatizaciones/[id]/route") = require("../../src/app/api/automatizaciones/[id]/route.ts");
const probar: typeof import("../../src/app/api/automatizaciones/[id]/probar/route") = require("../../src/app/api/automatizaciones/[id]/probar/route.ts");
const bitacora: typeof import("../../src/app/api/automatizaciones/[id]/ejecuciones/route") = require("../../src/app/api/automatizaciones/[id]/ejecuciones/route.ts");
const empresas = await Promise.all(["a", "b"].map((l) => dbRaw.org.create({ data: { nombre: l, slug: `reglas-${l}-${Date.now()}` } })));
const requestOriginal = https.request;
const fetchOriginal = globalThis.fetch;
let status = 200;
let llamadas = 0;
let cuerpoRecibido = "";
https.request = ((_url: unknown, _opciones: unknown, callback: (res: unknown) => void) => {
  const req = new EventEmitter() as EventEmitter & { end: (body: string) => void; destroy: (e: Error) => void };
  req.destroy = (e) => req.emit("error", e);
  req.end = (body) => { llamadas++; cuerpoRecibido = body; queueMicrotask(() => { callback({ statusCode: status, resume() {} }); req.emit("close"); }); };
  return req;
}) as typeof https.request;
syncBuiltinESMExports();
globalThis.fetch = async () => { throw new Error("fallo externo con TOKEN-PRIVADO"); };
const req = (method = "GET", body?: unknown) => new NextRequest("http://127.0.0.1/api/automatizaciones", {
  method, ...(body === undefined ? {} : { body: JSON.stringify(body) }), headers: { "Content-Type": "application/json" },
});
const reglaBase = { nombre: "Regla prueba", evento: "mensaje.recibido", condiciones: [], acciones: [{ tipo: "cambiar_estado", valor: "pendiente" }] };
async function fixture(orgId: bigint) {
  return runWithOrg(orgId, async () => {
    const agente = await db.usuario.create({ data: { nombre: "Agente", email: "agente@prueba.test", passwordHash: "simulado" } });
    const etiqueta = await db.etiqueta.create({ data: { nombre: "Interesado" } });
    const plantilla = await db.plantillaMensaje.create({ data: { nombre: "Saludo", contenido: "Hola {{nombre}}" } });
    const webhook = await db.webhookSaliente.create({ data: { url: "https://8.8.8.8/hook", secreto: encryptMetaToken("secreto"), eventos: ["contacto.creado"] } });
    const canal = await db.canalWhatsapp.create({ data: { nombre: "API", proveedor: "api", estado: "conectado", config: {
      webhookUrl: "https://8.8.8.8/api", secretEncrypted: encryptMetaToken("secreto") } } });
    const contacto = await db.contacto.create({ data: { nombre: "Ana Prueba", telefono: "521111111111", identificadorExterno: "ana", canalId: canal.id } });
    const conv = await db.conversacion.create({ data: { contactoId: contacto.id, canalId: canal.id, ultimoEntranteAt: new Date() } });
    await db.ajustes.create({ data: { crearLeadAuto: false } });
    return { agente, etiqueta, plantilla, webhook, canal, contacto, conv };
  });
}
try {
  const [a, b] = await Promise.all(empresas.map((o) => fixture(o.id)));
  const orgId = empresas[0].id;
  const ctx = { conversacionId: String(a.conv.id), origen: "contacto" as const, texto: "cita", contactoNuevo: true };
  assert.equal((await rutas.GET(req())).status, 401);
  sesion = { user: { id: String(a.agente.id), orgId: String(orgId), rol: "agente" } };
  assert.equal((await rutas.POST(req("POST", reglaBase))).status, 403);
  sesion.user.rol = "admin";
  for (const invalida of [
    { ...reglaBase, evento: "mensaje.enviado" }, { ...reglaBase, eval: "1" },
    { ...reglaBase, acciones: [{ tipo: "fuera_lista" }] }, { ...reglaBase, condiciones: [{ tipo: "contacto_nuevo", valor: "true" }] },
    { ...reglaBase, acciones: [{ tipo: "asignar_agente", id: String(b.agente.id) }] },
    { ...reglaBase, acciones: [{ tipo: "enviar_webhook", id: String(b.webhook.id) }] },
    { ...reglaBase, acciones: [{ tipo: "enviar_plantilla", id: String(b.plantilla.id) }] },
    { ...reglaBase, condiciones: [{ tipo: "etiqueta", valor: String(b.etiqueta.id) }] },
  ]) assert.equal((await rutas.POST(req("POST", invalida))).status, 400);
  const alta = await rutas.POST(req("POST", { ...reglaBase, acciones: [
    { tipo: "asignar_agente", id: String(a.agente.id) }, { tipo: "agregar_etiqueta", id: String(a.etiqueta.id) },
    { tipo: "cambiar_estado", valor: "pendiente" }, { tipo: "enviar_plantilla", id: String(a.plantilla.id) }, { tipo: "enviar_webhook", id: String(a.webhook.id) },
  ] }));
  assert.equal(alta.status, 201); const regla = await alta.json();
  const props = { params: Promise.resolve({ id: regla.id }) };
  const previas = llamadas;
  const simulacion = await probar.POST(req("POST"), props);
  assert.equal(simulacion.status, 200); assert.equal((await simulacion.json()).acciones.length, 5);
  assert.equal(llamadas, previas, "simular no envía");
  const ejecutar = () => ejecutarReglas(orgId, "mensaje.recibido", ctx);
  assert.equal((await ejecutar())[0].resultado, "ok");
  await esperarReglas(); await esperarWebhooks();
  await runWithOrg(orgId, async () => {
    const conv = await db.conversacion.findUniqueOrThrow({ where: { id: a.conv.id } });
    assert.equal(conv.responsableId, a.agente.id); assert.equal(conv.botActivo, false); assert.equal(conv.estado, "pendiente");
    assert.equal(await db.contactoEtiqueta.count({ where: { contactoId: a.contacto.id, etiquetaId: a.etiqueta.id } }), 1);
    assert.equal((await db.mensaje.findFirstOrThrow()).contenido, "Hola Ana");
    assert.equal(await db.ejecucionRegla.count(), 1, "etiquetar y cambiar estado no redisparan la regla");
  });
  assert.equal(JSON.parse(cuerpoRecibido).evento, "mensaje.recibido", "acción webhook reutiliza emisor");
  for (const origen of ["bot", "automatizacion"] as const) assert.equal((await ejecutarReglas(orgId, "mensaje.recibido", { ...ctx, origen })).length, 0);
  assert.equal((await ejecutarReglas(empresas[1].id, "mensaje.recibido", ctx)).length, 0, "no opera una conversación de otra empresa");
  sesion.user.orgId = String(empresas[1].id);
  assert.equal((await detalle.PATCH(req("PATCH", { activo: false }), props)).status, 404);
  assert.equal((await detalle.DELETE(req("DELETE"), props)).status, 404);
  assert.equal((await probar.POST(req("POST"), props)).status, 404);
  assert.equal((await bitacora.GET(req(), props)).status, 404);
  sesion.user.orgId = String(orgId);
  await runWithOrg(orgId, async () => {
    await guardarRegla(orgId, { acciones: [{ tipo: "enviar_plantilla", id: String(a.plantilla.id) }, { tipo: "cambiar_estado", valor: "cerrada" }] }, BigInt(regla.id));
    await db.canalWhatsapp.update({ where: { id: a.canal.id }, data: { proveedor: "messenger" } });
    await db.conversacion.update({ where: { id: a.conv.id }, data: { ultimoEntranteAt: new Date(Date.now() - 25 * 3600000) } });
  });
  const antesVentana = llamadas;
  const omitida = await ejecutar(); assert.equal(omitida[0].resultado, "omitida"); assert.match(omitida[0].detalle, /omitida_ventana, ok/);
  assert.equal(llamadas, antesVentana, "fuera de 24 h no intenta enviar");
  await runWithOrg(orgId, async () => {
    await db.canalWhatsapp.update({ where: { id: a.canal.id }, data: { proveedor: "api" } });
    await guardarRegla(orgId, { acciones: [{ tipo: "enviar_webhook", id: String(a.webhook.id) }, { tipo: "cambiar_estado", valor: "abierta" }] }, BigInt(regla.id));
  });
  status = 400;
  const fallida = await ejecutar(); assert.equal(fallida[0].resultado, "error"); assert.equal(fallida[0].detalle, "error_webhook, ok");
  status = 200;
  await runWithOrg(orgId, async () => {
    assert.equal((await db.conversacion.findUniqueOrThrow({ where: { id: a.conv.id } })).estado, "abierta");
    await guardarRegla(orgId, { acciones: [{ tipo: "enviar_plantilla", id: String(a.plantilla.id) }, { tipo: "cambiar_estado", valor: "pendiente" }] }, BigInt(regla.id));
    await db.canalWhatsapp.update({ where: { id: a.canal.id }, data: { proveedor: "cloud_api", config: { phoneNumberId: "123", tokenEncrypted: encryptMetaToken("TOKEN-PRIVADO") } } });
    await db.conversacion.update({ where: { id: a.conv.id }, data: { ultimoEntranteAt: new Date() } });
  });
  const externa = await ejecutar(); assert.equal(externa[0].resultado, "error"); assert.ok(externa[0].detalle.endsWith(", ok"));
  await runWithOrg(orgId, async () => {
    await db.canalWhatsapp.update({ where: { id: a.canal.id }, data: { proveedor: "api" } });
    await guardarRegla(orgId, { acciones: reglaBase.acciones }, BigInt(regla.id));
    await db.ejecucionRegla.deleteMany();
    const cuenta = await db.ejecucionRegla.count();
    await Promise.all(Array.from({ length: 22 }, () => cuenta < 20 ? db.ejecucionRegla.create({ data: { reglaId: BigInt(regla.id), conversacionId: a.conv.id, resultado: "ok", detalle: "sin bloqueo" } }) : null));
    assert.equal(await db.ejecucionRegla.count(), 22, "sin bloqueo excede cupo");
    await db.ejecucionRegla.deleteMany();
  });
  await Promise.all(Array.from({ length: 24 }, ejecutar));
  await runWithOrg(orgId, async () => {
    assert.equal(await db.ejecucionRegla.count(), 20, "con bloqueo solo 20 ejecuciones por hora");
    await db.ejecucionRegla.updateMany({ data: { creadoEn: new Date(Date.now() - 3600001) } });
  });
  assert.equal((await ejecutar()).length, 1, "el cupo se libera al pasar una hora");
  const logs = await bitacora.GET(req(), props);
  const textoLogs = await logs.text(); assert.ok(!textoLogs.includes("TOKEN-PRIVADO")); assert.ok(!textoLogs.includes("encv1:"));
  await runWithOrg(orgId, async () => {
    await db.ejecucionRegla.deleteMany();
    await db.reglaAutomatizacion.deleteMany();
    await guardarRegla(orgId, { ...reglaBase, evento: "conversacion.creada" });
    await guardarRegla(orgId, { ...reglaBase, evento: "conversacion.estado_cambiado" });
    await guardarRegla(orgId, { ...reglaBase, evento: "mensaje.recibido", condiciones: [{ tipo: "contacto_nuevo", valor: true }] });
    const mensaje = { waMessageId: "entrada-prueba", identificadorExterno: "nuevo", nombre: "Nuevo", tipo: "texto" as const, contenido: "cita", timestamp: new Date() };
    await ingestarEntrante(mensaje, a.canal.id);
    await esperarReglas(); await esperarWebhooks();
    assert.equal(await db.ejecucionRegla.count(), 2, "ingesta conecta conversación creada y mensaje recibido");
    await ingestarEntrante(mensaje, a.canal.id); await esperarReglas();
    assert.equal(await db.ejecucionRegla.count(), 2, "duplicados no emiten");
    await actualizarConversacion(orgId, a.conv.id, { estado: "cerrada" }); await esperarReglas();
    assert.equal(await db.ejecucionRegla.count(), 3, "edición de estado dispara una regla");
    dispararEvento(orgId, "mensaje.recibido", { id: "9" }, { ...ctx, origen: "automatizacion" }); await esperarReglas();
    assert.equal(await db.ejecucionRegla.count(), 3);
    await db.reglaAutomatizacion.deleteMany();
    const lecturas = await Promise.all(Array.from({ length: 27 }, () => db.reglaAutomatizacion.count()));
    await Promise.all(lecturas.map((c) => c < 25 ? db.reglaAutomatizacion.create({ data: reglaBase }) : null));
    assert.equal(await db.reglaAutomatizacion.count(), 27, "sin bloqueo excede 25");
    await db.reglaAutomatizacion.deleteMany();
    const altas = await Promise.allSettled(Array.from({ length: 27 }, () => guardarRegla(orgId, reglaBase)));
    assert.equal(altas.filter((r) => r.status === "fulfilled").length, 25);
    assert.equal(await db.reglaAutomatizacion.count(), 25, "con bloqueo respeta límite de reglas");
  });
  console.log("automatizaciones: 7 condiciones sí/no, 5 acciones, AND, permisos, RLS, simulación, ventana 24 h, fallos y anti-bucles OK; cupo sin/con 22/20; altas sin/con 27/25");
} finally {
  await esperarReglas(); await esperarWebhooks();
  https.request = requestOriginal; syncBuiltinESMExports(); globalThis.fetch = fetchOriginal; auth.getServerSession = originalAuth;
  for (const org of empresas) {
    await runWithOrg(org.id, async () => {
      await db.ejecucionRegla.deleteMany(); await db.reglaAutomatizacion.deleteMany(); await db.contactoEtiqueta.deleteMany();
      await db.mensaje.deleteMany(); await db.conversacion.deleteMany(); await db.contacto.deleteMany(); await db.canalWhatsapp.deleteMany();
      await db.webhookSaliente.deleteMany(); await db.plantillaMensaje.deleteMany(); await db.etiqueta.deleteMany(); await db.ajustes.deleteMany(); await db.usuario.deleteMany();
    });
    await dbRaw.org.delete({ where: { id: org.id } });
  }
  await dbRaw.$disconnect();
}
