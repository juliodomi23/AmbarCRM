import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import pg from "pg";
import { dbRaw } from "../../src/lib/db";
import { transaccionTenant } from "../../src/lib/retail-db";
import { hoyAR, mesSiguiente } from "../../src/lib/contratos-cobros";

const baseUrl = process.env.E2E_BASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
if (!baseUrl || !adminUrl) throw new Error("Define E2E_BASE_URL y ADMIN_DATABASE_URL para una app local de pruebas");
if (!["localhost", "127.0.0.1"].includes(new URL(baseUrl).hostname) || !["localhost", "127.0.0.1"].includes(new URL(adminUrl).hostname) || new URL(adminUrl).port !== "55453") throw new Error("Esta prueba del seed solo admite la BD desechable local en 55453");
const admin = new pg.Pool({ connectionString: adminUrl });
const org = await dbRaw.org.findUniqueOrThrow({ where: { slug: "ambar-rojo" } });
const configOriginal = await transaccionTenant(org.id, (tx) => tx.moduloOrg.findUniqueOrThrow({ where: { orgId_clave: { orgId: org.id, clave: "cobros" } } }));
const sufijo = Date.now().toString();
const otraOrg = await dbRaw.org.create({ data: { nombre: "Otra organización AR E2E", slug: `ar-e2e-${sufijo}` } });
let contratoId: bigint | null = null;
let contactoId: bigint | null = null;
let cookie = "";

function cookies(res: Response) {
  return res.headers.getSetCookie().map((valor) => valor.split(";", 1)[0]).join("; ");
}
async function login(email: string, password: string, slug: string) {
  const csrf = await fetch(`${baseUrl}/api/auth/csrf`);
  const actual = cookies(csrf);
  const { csrfToken } = await csrf.json();
  const res = await fetch(`${baseUrl}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { Cookie: actual, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken, email, password, orgSlug: slug, json: "true", callbackUrl: `${baseUrl}/panel-ar` }) });
  const resultado = `${actual}; ${cookies(res)}`;
  assert.match(resultado, /next-auth.session-token/);
  return resultado;
}
async function api(ruta: string, metodo = "GET", cuerpo?: unknown, sesion = cookie) {
  const res = await fetch(`${baseUrl}${ruta}`, { method: metodo, redirect: "manual", headers: { Cookie: sesion, "Content-Type": "application/json" }, body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

try {
  cookie = await login("admin@ambar-rojo.local.test", "AR-Prueba-2026", "ambar-rojo");
  const inicial = await api("/api/panel-ar");
  assert.equal(inicial.status, 200);
  assert.equal(inicial.data.mrr, "4400");
  assert.equal(inicial.data.cobradoMes, "0", "el seed no inventa fechas de pagos históricos");
  assert.equal((await api("/api/panel-ar/ajustes", "PATCH", { proyectoCtoPct: "" })).status, 400);
  assert.equal((await api("/api/panel-ar/ajustes", "PATCH", { credito_ia_mxn: "" })).status, 400);
  const otro = await transaccionTenant(otraOrg.id, async (tx) => {
    const contacto = await tx.contacto.create({ data: { nombre: "Otro cliente" } });
    const contrato = await tx.contrato.create({ data: { contactoId: contacto.id, tipo: "web", estado: "produccion", mensualidad: "9999", diaCobro: 5 } });
    await tx.moduloOrg.createMany({ data: ["contratos", "cobros", "panel_ar"].map((clave) => ({ clave, activo: true })) });
    const cobro = await tx.cobro.create({ data: { contratoId: contrato.id, concepto: "extra", monto: "8888" } });
    await tx.usuario.create({ data: { nombre: "Admin otro", email: "otro@ar.local.test", passwordHash: await bcrypt.hash("AR-Prueba-2026", 10), rol: "admin" } });
    return { contacto, contrato, cobro };
  });
  contactoId = (await transaccionTenant(org.id, (tx) => tx.contacto.create({ data: { nombre: `Contrato E2E ${sufijo}` } }))).id;
  assert.equal((await api("/api/contratos", "POST", { contactoId: String(otro.contacto.id), tipo: "web" })).status, 400);
  assert.equal((await api("/api/contratos", "POST", null)).status, 400);
  assert.equal((await api("/api/cobros", "POST", null)).status, 400);
  assert.equal((await api("/api/contratos", "POST", { contactoId: String(contactoId), tipo: "web", diaCobro: 31 })).status, 400);
  assert.equal((await api("/api/contratos", "POST", { contactoId: String(contactoId), tipo: "web", montoCierre: "1.001" })).status, 400);
  const creada = await api("/api/contratos", "POST", { contactoId: String(contactoId), tipo: "web", estado: "produccion", montoCierre: "100.01", anticipoPct: "50", mensualidad: "100", diaCobro: 5 });
  assert.equal(creada.status, 201);
  contratoId = BigInt(creada.data.contrato.id);
  const detalle = await api(`/api/contratos/${contratoId}`);
  assert.deepEqual(detalle.data.contrato.cobros.map((cobro: { monto: string }) => cobro.monto).sort(), ["50", "50.01"]);
  const anticipo = detalle.data.contrato.cobros.find((cobro: { concepto: string }) => cobro.concepto === "anticipo");
  const balance = detalle.data.contrato.cobros.find((cobro: { concepto: string }) => cobro.concepto === "balance");
  assert.equal(anticipo.vence, null);
  assert.equal((await api(`/api/cobros/${anticipo.id}`, "PATCH", { vence: hoyAR() })).status, 200);
  const pagos = await Promise.all([api(`/api/cobros/${anticipo.id}`, "PATCH", { estado: "pagado", metodo: "transferencia" }), api(`/api/cobros/${anticipo.id}`, "PATCH", { estado: "pagado", metodo: "transferencia" })]);
  assert.ok(pagos.every((pago) => pago.status === 200));
  assert.equal(pagos.filter((pago) => !pago.data.repetido).length, 1);
  assert.equal((await api(`/api/cobros/${balance.id}`, "PATCH", { estado: "cancelado" })).status, 400);
  assert.equal((await api(`/api/cobros/${balance.id}/recordar`, "POST")).status, 409, "sin canal no hay envío");
  assert.equal((await api(`/api/cobros/${balance.id}`, "PATCH", { estado: "cancelado", nota: "Caso E2E" })).status, 200);
  assert.equal((await api(`/api/cobros/${balance.id}`, "PATCH", { estado: "pagado", metodo: "efectivo" })).status, 409);
  const cronSinKey = await fetch(`${baseUrl}/api/cron/generar-cobros`, { method: "POST" });
  assert.equal(cronSinKey.status, 401);
  const crons = await Promise.all([1, 2].map(() => fetch(`${baseUrl}/api/cron/generar-cobros`, { method: "POST", headers: { "x-api-key": process.env.WA_API_KEY! } })));
  assert.ok(crons.every((res) => res.status === 200));
  const cargos = await api(`/api/cobros?contratoId=${contratoId}`);
  const mensualidades = cargos.data.cobros.filter((cobro: { concepto: string }) => cobro.concepto === "mensualidad");
  assert.equal(mensualidades.length, 1);
  assert.equal(mensualidades[0].periodo.slice(0, 10), mesSiguiente(hoyAR()).toISOString().slice(0, 10));
  assert.equal((await api(`/api/cobros/${mensualidades[0].id}`, "PATCH", { metodo: "efectivo" })).status, 200);
  const panel = await api("/api/panel-ar");
  assert.equal(panel.data.mrr, "4500");
  assert.equal(panel.data.cobradoMes, "150.01");
  assert.equal(panel.data.comisiones.creditoIA, "100");
  assert.equal(panel.data.comisiones.cto, "35.01");
  assert.equal(panel.data.comisiones.ceo, "15");
  assert.equal((await api(`/api/contratos/${otro.contrato.id}`)).status, 404);
  assert.equal((await api(`/api/cobros/${otro.cobro.id}`)).status, 404);
  assert.equal((await api(`/api/cobros/${otro.cobro.id}`, "PATCH", { metodo: "efectivo" })).status, 404);
  assert.equal((await api("/api/cobros", "POST", { contratoId: String(otro.contrato.id), monto: "1" })).status, 400);
  const otraCookie = await login("otro@ar.local.test", "AR-Prueba-2026", otraOrg.slug);
  assert.equal((await api(`/api/contratos/${contratoId}`, "GET", undefined, otraCookie)).status, 404);
  assert.equal((await api(`/api/cobros/${anticipo.id}`, "GET", undefined, otraCookie)).status, 404);
  await transaccionTenant(org.id, (tx) => tx.usuario.create({ data: { nombre: "Agente E2E AR", email: `agente-${sufijo}@local.test`, passwordHash: bcrypt.hashSync("AR-Prueba-2026", 10), rol: "agente", puesto: "Agente" } }));
  const agente = await login(`agente-${sufijo}@local.test`, "AR-Prueba-2026", org.slug);
  const sesionAgente = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: agente } });
  assert.equal((await sesionAgente.json()).user.rol, "agente", "el login debe pertenecer al agente");
  for (const ruta of ["/api/contratos", "/api/cobros", "/api/panel-ar", "/api/panel-ar/exportar"]) {
    const resultado = await api(ruta, "GET", undefined, agente);
    assert.equal(resultado.status, 403, `${ruta}: agente sin permiso`);
  }
  await transaccionTenant(org.id, (tx) => tx.moduloOrg.update({ where: { orgId_clave: { orgId: org.id, clave: "cobros" } }, data: { config: { puestosPermitidos: ["Agente"], recordatoriosAutomaticos: false } } }));
  assert.equal((await api(`/api/cobros/${anticipo.id}`, "PATCH", { estado: "incobrable", nota: "Agente" }, agente)).status, 403);
  await transaccionTenant(org.id, (tx) => tx.moduloOrg.update({ where: { orgId_clave: { orgId: org.id, clave: "cobros" } }, data: { config: { recordatoriosAutomaticos: false }, activo: false } }));
  assert.equal((await api("/api/cobros")).status, 404);
  for (const pagina of ["/contratos", "/panel-ar"]) assert.equal((await fetch(`${baseUrl}${pagina}`, { headers: { Cookie: cookie } })).status, 200);
  const csv = await fetch(`${baseUrl}/api/panel-ar/exportar`, { headers: { Cookie: cookie } });
  assert.equal(csv.status, 200);
  assert.match(await csv.text(), /Cobrado del mes/);
  console.log("cobros E2E: login orgSlug, seed MRR 4400, contrato → anticipo/balance → cron concurrente → mensualidad → pago, MRR 4500 y cobrado 150.01, IA 100, errores 400/404/409, permisos 403, módulo apagado 404, aislamiento bidireccional y CSV OK; cero envíos");
} finally {
  if (contratoId) await admin.query("DELETE FROM cobros WHERE org_id=$1 AND contrato_id=$2", [String(org.id), String(contratoId)]);
  if (contratoId) await admin.query("DELETE FROM contratos WHERE org_id=$1 AND id=$2", [String(org.id), String(contratoId)]);
  if (contactoId) await admin.query("DELETE FROM contactos WHERE org_id=$1 AND id=$2", [String(org.id), String(contactoId)]);
  await admin.query("DELETE FROM usuarios WHERE org_id=$1 AND email=$2", [String(org.id), `agente-${sufijo}@local.test`]);
  await admin.query("UPDATE modulos_org SET activo=$3, config=$2::jsonb WHERE org_id=$1 AND clave='cobros'", [String(org.id), JSON.stringify(configOriginal.config), configOriginal.activo]);
  for (const tabla of ["cobros", "contratos", "contactos", "usuarios", "modulos_org"]) await admin.query(`DELETE FROM ${tabla} WHERE org_id=$1`, [String(otraOrg.id)]);
  await admin.query("DELETE FROM orgs WHERE id=$1", [String(otraOrg.id)]);
  await Promise.all([admin.end(), dbRaw.$disconnect()]);
}
