import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import pg from "pg";
import { dbRaw } from "../../src/lib/db";
import { transaccionTenant } from "../../src/lib/retail-db";
import { fechaAR, hoyAR, mesSiguiente } from "../../src/lib/contratos-cobros";
import { saldoCobro } from "../../src/lib/ar-vistas";
import { alertasAR } from "../../src/lib/alertas-ar-db";

const baseUrl = process.env.E2E_BASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const appUrl = process.env.DATABASE_URL;
if (!baseUrl || !adminUrl || !appUrl || ![baseUrl, adminUrl, appUrl].every(url => ["localhost", "127.0.0.1"].includes(new URL(url).hostname))) throw new Error("Usa únicamente app y BD desechables locales");
assert.equal(new URL(appUrl).username, "crm_app");
assert.ok(["55450", "55453"].includes(new URL(appUrl).port), "usa un puerto reservado para pruebas");
assert.equal(new URL(appUrl).pathname, "/crm");
assert.equal(new URL(adminUrl).port, new URL(appUrl).port);
assert.equal(new URL(adminUrl).pathname, "/crm");
const admin = new pg.Pool({ connectionString: adminUrl });
const sufijo = String(Date.now());
const org = await dbRaw.org.create({ data: { nombre: "Cancelar y eliminar E2E", slug: `cancelar-${sufijo}` } });
const otra = await dbRaw.org.create({ data: { nombre: "Aislamiento cancelar E2E", slug: `cancelar-otra-${sufijo}` } });
let cookie = "";
const hoy = hoyAR();
const periodo = mesSiguiente(hoy).toISOString().slice(0, 10);
const atraso = new Date(fechaAR(hoy)!.getTime() - 20 * 86400000);

function cookies(res: Response) { return res.headers.getSetCookie().map(c => c.split(";", 1)[0]).join("; "); }
async function login(email: string, slug: string) {
  const csrf = await fetch(`${baseUrl}/api/auth/csrf`);
  const inicial = cookies(csrf);
  const { csrfToken } = await csrf.json();
  const res = await fetch(`${baseUrl}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { Cookie: inicial, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken, email, password: "Cobros-Prueba-2026", orgSlug: slug, json: "true", callbackUrl: `${baseUrl}/cobros` }) });
  const resultado = `${inicial}; ${cookies(res)}`;
  assert.match(resultado, /next-auth.session-token/);
  return resultado;
}
async function api(ruta: string, method = "GET", body?: unknown, sesion = cookie) {
  const res = await fetch(`${baseUrl}${ruta}`, { method, redirect: "manual", headers: { Cookie: sesion, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}
const ruta = (id: bigint | string) => `/api/cobros/${id}`;
const cancelar = { estado: "cancelado", nota: "Pago registrado por error" };
async function cron() {
  const res = await fetch(`${baseUrl}/api/cron/generar-cobros`, { method: "POST", headers: { "x-api-key": process.env.WA_API_KEY! } });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  return data;
}
async function panel() {
  const res = await api("/api/panel-ar");
  assert.equal(res.status, 200);
  return res.data;
}

try {
  const [rol] = await dbRaw.$queryRaw<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }[]>`SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
  assert.deepEqual(rol, { rolname: "crm_app", rolsuper: false, rolbypassrls: false });
  assert.equal(await dbRaw.cobro.count(), 0, "sin tenant RLS no permite leer cobros");
  const passwordHash = await bcrypt.hash("Cobros-Prueba-2026", 10);
  const fixture = await transaccionTenant(org.id, async tx => {
    await tx.moduloOrg.createMany({ data: ["contratos", "cobros", "panel_ar"].map(clave => ({ clave, activo: true, config: { puestosPermitidos: ["Administrador", "Agente"] } })) });
    await tx.usuario.createMany({ data: [
      { nombre: "Admin pruebas", email: "admin@cancelar.local.test", passwordHash, rol: "admin", puesto: "Administrador" },
      { nombre: "Agente pruebas", email: "agente@cancelar.local.test", passwordHash, rol: "agente", puesto: "Agente" },
    ] });
    const contacto = await tx.contacto.create({ data: { nombre: `Cliente cancelación ${sufijo}` } });
    const contrato = await tx.contrato.create({ data: { contactoId: contacto.id, tipo: "web", estado: "produccion", mensualidad: "300", diaCobro: 5 } });
    const segundo = await tx.contrato.create({ data: { contactoId: contacto.id, tipo: "otro", estado: "produccion", mensualidad: "200", diaCobro: 5 } });
    const extra = await tx.cobro.create({ data: { contratoId: contrato.id, concepto: "extra", monto: "100", vence: atraso } });
    const parcial = await tx.cobro.create({ data: { contratoId: contrato.id, concepto: "extra", monto: "100", vence: atraso } });
    const pendiente = await tx.cobro.create({ data: { contratoId: contrato.id, concepto: "extra", monto: "10" } });
    const incobrable = await tx.cobro.create({ data: { contratoId: contrato.id, concepto: "extra", monto: "20", estado: "incobrable", nota: "Sin cambios" } });
    return { contacto, contrato, segundo, extra, parcial, pendiente, incobrable };
  });
  await transaccionTenant(otra.id, async tx => {
    await tx.usuario.create({ data: { nombre: "Admin otra", email: "admin@otra.local.test", passwordHash, rol: "admin", puesto: "Administrador" } });
    await tx.moduloOrg.create({ data: { clave: "cobros", activo: true } });
  });
  cookie = await login("admin@cancelar.local.test", org.slug);
  const agente = await login("agente@cancelar.local.test", org.slug);
  const ajena = await login("admin@otra.local.test", otra.slug);
  assert.equal((await api(ruta(fixture.extra.id), "DELETE", undefined, "")).status, 307, "el middleware redirige a login sin sesión");
  assert.equal((await api(ruta(fixture.extra.id), "GET", undefined, agente)).status, 200, "agente tiene acceso al módulo para probar la restricción de la acción");
  const pagar = (id: bigint, monto: string) => api(ruta(id), "PATCH", { estado: "pagado", monto, fechaPago: hoy, metodo: "transferencia", clavePago: `pago-${id}-${sufijo}` });
  assert.equal((await pagar(fixture.extra.id, "100")).status, 200);
  assert.equal((await pagar(fixture.parcial.id, "40")).status, 200);
  assert.equal((await panel()).cobradoMes, "140");
  assert.equal((await api(ruta(fixture.extra.id), "PATCH", { estado: "cancelado" })).status, 400);
  assert.equal((await api(ruta(fixture.extra.id), "PATCH", { estado: "cancelado", nota: "   " })).status, 400);
  assert.equal((await api(ruta(fixture.extra.id), "PATCH", cancelar, agente)).status, 403);
  assert.equal((await api(ruta(fixture.extra.id), "DELETE", undefined, agente)).status, 403);
  for (const id of [fixture.extra.id, fixture.pendiente.id, fixture.incobrable.id]) {
    const res = await api(ruta(id), "DELETE");
    assert.equal(res.status, 409);
    assert.equal(res.data.error, "Cancela el cobro antes de eliminarlo");
  }
  assert.equal((await api(ruta(fixture.incobrable.id), "PATCH", cancelar)).status, 409);
  assert.equal((await api(ruta(fixture.extra.id), "PATCH", { estado: "incobrable", nota: "No admitido" })).status, 409);
  const original = (await api(ruta(fixture.extra.id))).data.cobro;
  const cancelaciones = await Promise.all([api(ruta(fixture.extra.id), "PATCH", cancelar), api(ruta(fixture.extra.id), "PATCH", cancelar)]);
  assert.ok(cancelaciones.every(r => r.status === 200));
  assert.equal(cancelaciones.filter(r => r.data.repetido).length, 1);
  const cancelado = (await api(ruta(fixture.extra.id))).data.cobro;
  for (const campo of ["pagos", "montoPagado", "pagadoEn", "metodo", "referencia"]) assert.deepEqual(cancelado[campo], original[campo], `se conserva ${campo}`);
  assert.equal(cancelado.estado, "cancelado");
  assert.equal((await panel()).cobradoMes, "40");
  assert.equal((await api(ruta(fixture.parcial.id), "PATCH", cancelar)).status, 200);
  const parcial = await transaccionTenant(org.id, tx => tx.cobro.findUniqueOrThrow({ where: { id: fixture.parcial.id } }));
  assert.equal(parcial.montoPagado.toString(), "40");
  assert.equal(saldoCobro(parcial).toString(), "0");
  const despues = await panel();
  assert.equal(despues.cobradoMes, "0");
  assert.equal(despues.vencido, "0");
  assert.equal(despues.mrr, "500", "MRR sigue siendo contractual, los cobros no se suman");
  assert.equal(despues.mrrProyectado, "500");
  assert.deepEqual(despues.pendientes.map((c: { id: string }) => c.id), [String(fixture.pendiente.id)]);
  assert.equal(despues.calendario.some((c: { estado: string }) => c.estado === "cancelado"), false);
  assert.equal((await api("/api/panel-ar/alertas")).status, 404, "el endpoint de alertas mantiene su restricción a la org plataforma");
  const alertas = await alertasAR(org.id);
  assert.equal(alertas.lista.some(a => a.texto.includes(fixture.contacto.nombre)), false);
  // Cobro cancelado con vencimiento en el mes: tampoco aparece en calendario/CSV.
  await transaccionTenant(org.id, tx => tx.cobro.update({ where: { id: fixture.extra.id }, data: { vence: fechaAR(hoy) } }));
  const csv = await fetch(`${baseUrl}/api/panel-ar/exportar`, { headers: { Cookie: cookie } });
  assert.equal(csv.status, 200);
  assert.equal((await csv.text()).includes(fixture.contacto.nombre), false);
  assert.equal((await panel()).totalCalendario, 0);
  const pagina = await fetch(`${baseUrl}/cobros`, { headers: { Cookie: cookie } });
  assert.equal(pagina.status, 200);
  assert.match((await pagina.text()).replace(/<!--.*?-->/g, ""), /Cobrado registrado · todos los periodos[\s\S]{0,200}\$0\.00/);
  assert.equal((await api(ruta(fixture.extra.id), "PATCH", { metodo: "efectivo" })).status, 409);
  assert.equal((await api(ruta(fixture.extra.id), "DELETE", undefined, ajena)).status, 404);
  assert.equal((await api(ruta(fixture.extra.id), "PATCH", cancelar, ajena)).status, 404);
  await transaccionTenant(org.id, tx => tx.moduloOrg.update({ where: { orgId_clave: { orgId: org.id, clave: "cobros" } }, data: { activo: false } }));
  assert.equal((await api(ruta(fixture.extra.id), "DELETE")).status, 404);
  await transaccionTenant(org.id, tx => tx.moduloOrg.update({ where: { orgId_clave: { orgId: org.id, clave: "cobros" } }, data: { activo: true } }));
  console.log("OK: crm_app sin BYPASSRLS; sin nota 400; agente con acceso 403; estados cerrados 409; cancelación concurrente idempotente conserva pagos; saldo/cartera/ingreso/calendario/CSV/alertas excluyen cancelados; aislamiento 404 y módulo apagado 404");

  await cron();
  const mensuales = await transaccionTenant(org.id, tx => tx.cobro.findMany({ where: { concepto: "mensualidad" }, orderBy: { monto: "desc" } }));
  assert.equal(mensuales.length, 2);
  assert.equal(mensuales[0].periodo?.toISOString().slice(0, 10), periodo);
  // El crédito IA de un pago del mes anterior cancelado debe poder repartirse de nuevo.
  const pasado = new Date(`${hoy.slice(0, 7)}-01T00:00:00-06:00`);
  pasado.setTime(pasado.getTime() - 86400000);
  await transaccionTenant(org.id, tx => tx.cobro.update({ where: { id: mensuales[0].id }, data: { estado: "pagado", montoPagado: "300", pagadoEn: pasado, metodo: "transferencia", pagos: [{ clave: "pago-anterior", monto: "300", pagadoEn: pasado.toISOString(), metodo: "transferencia", referencia: null }] } }));
  assert.equal((await pagar(mensuales[1].id, "200")).status, 200);
  assert.equal((await panel()).comisiones.creditoIA, "0");
  assert.equal((await api(ruta(mensuales[0].id), "PATCH", cancelar)).status, 200);
  const mensual = await panel();
  assert.equal(mensual.comisiones.creditoIA, "100");
  assert.equal(mensual.comisiones.cto, "50");
  assert.equal(mensual.comisiones.ceo, "50");
  assert.equal((await api(ruta(mensuales[1].id), "PATCH", cancelar)).status, 200);
  const sinComisiones = await panel();
  assert.equal(sinComisiones.cobradoMes, "0");
  assert.deepEqual(sinComisiones.comisiones, { creditoIA: "0", cto: "0", ceo: "0" });
  for (const c of mensuales) {
    const res = await api(ruta(c.id), "DELETE");
    assert.equal(res.status, 409);
    assert.equal(res.data.error, "Las mensualidades canceladas se conservan para que no se vuelvan a generar");
  }
  const eliminaciones = await Promise.all([api(ruta(fixture.extra.id), "DELETE"), api(ruta(fixture.extra.id), "DELETE")]);
  assert.deepEqual(eliminaciones.map(r => r.status).sort(), [204, 404]);
  assert.equal((await api(ruta(fixture.extra.id))).status, 404);
  assert.equal((await api(ruta(fixture.parcial.id), "DELETE")).status, 204);
  for (const concepto of ["anticipo", "balance"]) {
    const c = await api("/api/cobros", "POST", { contratoId: String(fixture.contrato.id), concepto, monto: "50" });
    assert.equal(c.status, 201);
    assert.equal((await api(ruta(c.data.cobro.id), "PATCH", cancelar)).status, 200);
    assert.equal((await api(ruta(c.data.cobro.id), "DELETE")).status, 204);
  }
  const antesCron = await transaccionTenant(org.id, tx => tx.cobro.findMany({ orderBy: { id: "asc" } }));
  for (let i = 0; i < 2; i++) assert.equal((await cron()).generados, 0, "cron no recrea extras ni mensualidades canceladas");
  assert.deepEqual(await transaccionTenant(org.id, tx => tx.cobro.findMany({ orderBy: { id: "asc" } })), antesCron);
  assert.equal(antesCron.filter(c => c.concepto === "mensualidad" && c.estado === "cancelado").length, 2);
  console.log("OK: comisiones excluyen abonos cancelados del mes anterior; pago mensual cancelado fuera de ingresos/reparto; mensualidades con periodo 409; extras/anticipos/balances 204; delete concurrente 204/404; cron repetido genera 0 y conserva exactamente las filas");
} finally {
  for (const id of [org.id, otra.id]) {
    for (const tabla of ["cobros", "contratos", "contactos", "usuarios", "modulos_org"]) await admin.query(`DELETE FROM ${tabla} WHERE org_id=$1`, [String(id)]);
    await admin.query("DELETE FROM orgs WHERE id=$1", [String(id)]);
  }
  await Promise.all([admin.end(), dbRaw.$disconnect()]);
}
