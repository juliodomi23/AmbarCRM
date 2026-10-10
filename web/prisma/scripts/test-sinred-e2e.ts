import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import pg from "pg";
import { dbRaw } from "../../src/lib/db";
import { transaccionTenant } from "../../src/lib/retail-db";

const { Pool } = pg;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3118";
if (!adminUrl) throw new Error("Define ADMIN_DATABASE_URL con el usuario dueño");
const admin = new Pool({ connectionString: adminUrl, max: 1 });
const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const orgId = BigInt(Date.now()) * 1000n + 931n;
const slug = `e2e-sinred-${sufijo}`;
const password = "SinRed-E2E-2026!";
const correo = (rol: string) => `sinred-${rol}-${sufijo}@test.local`;

function cookiesDe(respuesta: Response) {
  const headers = respuesta.headers as Headers & { getSetCookie?: () => string[] };
  const valores = headers.getSetCookie?.() ?? (respuesta.headers.get("set-cookie") ? [respuesta.headers.get("set-cookie")!] : []);
  return valores.map((valor) => valor.split(";", 1)[0]).join("; ");
}
function combinar(actual: string, nuevas: string) {
  const mapa = new Map<string, string>();
  for (const parte of `${actual}; ${nuevas}`.split(";").map((item) => item.trim()).filter(Boolean)) mapa.set(parte.split("=", 1)[0], parte);
  return [...mapa.values()].join("; ");
}
async function login(email: string) {
  const csrf = await fetch(`${baseUrl}/api/auth/csrf`);
  let cookie = cookiesDe(csrf);
  const body = new URLSearchParams({ csrfToken: (await csrf.json()).csrfToken, email, password, orgSlug: slug, callbackUrl: `${baseUrl}/caja`, json: "true" });
  const respuesta = await fetch(`${baseUrl}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" }, body });
  cookie = combinar(cookie, cookiesDe(respuesta));
  assert.ok(cookie.includes("session-token"), `login de ${email}`);
  return cookie;
}
async function api(cookie: string, ruta: string, method = "GET", cuerpo?: unknown) {
  const respuesta = await fetch(`${baseUrl}${ruta}`, { method, redirect: "manual", headers: { ...(cookie ? { Cookie: cookie } : {}), ...(cuerpo ? { "Content-Type": "application/json" } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  return { status: respuesta.status, data: await respuesta.json().catch(() => ({})) };
}
const folio = () => `SR-${randomBytes(5).toString("hex").toUpperCase()}`;

async function main() {
  await admin.query("INSERT INTO orgs (id, nombre, slug) VALUES ($1, 'Sin red E2E', $2)", [String(orgId), slug]);
  const preparado = await transaccionTenant(orgId, async (tx) => {
    await tx.moduloOrg.createMany({ data: [
      { clave: "caja", activo: true, config: {} }, { clave: "productos", activo: true, config: {} }, { clave: "ventas", activo: true, config: {} },
    ] });
    const hash = await bcrypt.hash(password, 10);
    const crear = (rol: "admin" | "agente", puesto: string, clave: string) =>
      tx.usuario.create({ data: { nombre: `Persona ${clave}`, email: correo(clave), passwordHash: hash, rol, puesto } });
    const usuarios = {
      admin: await crear("admin", "Administrador", "admin"), cajero: await crear("agente", "Cajero", "cajero"),
      cajero2: await crear("agente", "Cajero", "cajero2"), encargado: await crear("agente", "Encargado de tienda", "encargado"),
    };
    const caja = await tx.caja.create({ data: { nombre: "Caja E2E" } });
    const caja2 = await tx.caja.create({ data: { nombre: "Caja E2E 2" } });
    const producto = await tx.producto.create({ data: { sku: `SR-${sufijo}`, nombre: "Producto sin red", precio: 50, costo: 20, stock: 10 } });
    return { usuarios, caja, caja2, producto };
  });
  const cookies = {
    admin: await login(correo("admin")), cajero: await login(correo("cajero")),
    cajero2: await login(correo("cajero2")), encargado: await login(correo("encargado")),
  };
  const cuerpo = (usuario: { id: bigint }, turnoId: string, extra: Record<string, unknown> = {}) => {
    const uuid = randomUUID();
    return {
      orgId: String(orgId), userId: String(usuario.id), turnoId, uuidCliente: uuid, folio: folio(), vendidaAt: new Date().toISOString(),
      totalCobrado: "50.00", descuento: "0", catalogoVersion: "e2e",
      partidas: [{ productoId: String(preparado.producto.id), cantidad: "1", descuento: "0" }],
      pagos: [{ metodo: "efectivo", monto: "50.00" }], ...extra,
    };
  };
  const turnoDe = async (cookie: string, cajaId = preparado.caja.id) => (await api(cookie, "/api/caja/turnos", "POST", { cajaId: String(cajaId), fondoInicial: "100" })).data.turno.id as string;

  // Apagado (por defecto): ni catálogo ni subida.
  const turnoCajero = await turnoDe(cookies.cajero);
  const venta1 = cuerpo(preparado.usuarios.cajero, turnoCajero);
  const apagado = await api(cookies.cajero, "/api/caja/ventas/sin-red", "POST", venta1);
  assert.equal(apagado.status, 403);
  assert.equal(apagado.data.codigo, "SIN_RED_APAGADO");
  assert.equal((await api(cookies.cajero, "/api/caja/catalogo")).status, 403);
  assert.ok([401, 307].includes((await api("", "/api/caja/ventas/sin-red", "POST", venta1)).status), "sin sesión no sube");

  // Solo el Admin lo enciende.
  assert.equal((await api(cookies.cajero, "/api/modulos", "PATCH", { clave: "caja", config: { ventasSinRed: true } })).status, 403);
  assert.equal((await api(cookies.admin, "/api/modulos", "PATCH", { clave: "caja", config: { ventasSinRed: true } })).status, 200);

  // Catálogo: identidad propia y precios calculados.
  const catalogo = await api(cookies.cajero, "/api/caja/catalogo");
  assert.equal(catalogo.status, 200);
  assert.deepEqual(catalogo.data.identidad, { orgId: String(orgId), userId: String(preparado.usuarios.cajero.id) });
  assert.equal(catalogo.data.sinTopeDescuento, false);
  assert.equal(catalogo.data.catalogo.productos.length, 1);
  assert.equal((await api(cookies.encargado, "/api/caja/catalogo")).data.sinTopeDescuento, true);

  // Subida idempotente.
  const primera = await api(cookies.cajero, "/api/caja/ventas/sin-red", "POST", venta1);
  assert.equal(primera.status, 201);
  assert.equal(primera.data.venta.folio, venta1.folio);
  assert.equal(primera.data.venta.sinRed, true);
  const repetida = await api(cookies.cajero, "/api/caja/ventas/sin-red", "POST", { ...venta1 });
  assert.equal(repetida.status, 200);
  assert.equal(repetida.data.repetida, true);
  const ventas = await transaccionTenant(orgId, (tx) => tx.venta.count({ where: { uuidCliente: venta1.uuidCliente } }));
  assert.equal(ventas, 1);
  assert.equal(Number((await transaccionTenant(orgId, (tx) => tx.producto.findUniqueOrThrow({ where: { id: preparado.producto.id } }))).stock), 9);

  // La cola de otra persona no se sube con esta sesión (y no queda como rechazo).
  const ajena = await api(cookies.cajero2, "/api/caja/ventas/sin-red", "POST", cuerpo(preparado.usuarios.cajero, turnoCajero));
  assert.equal(ajena.status, 403);
  assert.equal(ajena.data.codigo, "IDENTIDAD_DISTINTA");
  const enOtraEmpresa = await api(cookies.cajero, "/api/caja/ventas/sin-red", "POST", cuerpo(preparado.usuarios.cajero, turnoCajero, { orgId: String(orgId + 1n) }));
  assert.equal(enOtraEmpresa.data.codigo, "IDENTIDAD_DISTINTA");
  // Y el turno de otra persona tampoco sirve: se rechaza y queda registrado.
  const turnoCajero2 = await turnoDe(cookies.cajero2, preparado.caja2.id);
  const turnoAjeno = await api(cookies.cajero, "/api/caja/ventas/sin-red", "POST", cuerpo(preparado.usuarios.cajero, turnoCajero2));
  assert.equal(turnoAjeno.status, 403);
  assert.equal(turnoAjeno.data.codigo, "TURNO_AJENO");

  // Rechazos definitivos: más de 72 h, cliente, nota de crédito, descuento arriba del tope. Cada uno queda registrado una vez.
  const vieja = cuerpo(preparado.usuarios.cajero, turnoCajero, { vendidaAt: new Date(Date.now() - 73 * 3_600_000).toISOString() });
  const rechazo = await api(cookies.cajero, "/api/caja/ventas/sin-red", "POST", vieja);
  assert.equal(rechazo.status, 400);
  assert.equal(rechazo.data.codigo, "VENTA_MUY_ANTIGUA");
  const otraVez = await api(cookies.cajero, "/api/caja/ventas/sin-red", "POST", vieja);
  assert.equal(otraVez.status, 400);
  assert.equal(otraVez.data.codigo, "VENTA_MUY_ANTIGUA");
  const conCliente = await api(cookies.cajero, "/api/caja/ventas/sin-red", "POST", cuerpo(preparado.usuarios.cajero, turnoCajero, { contactoId: "123" }));
  assert.equal(conCliente.status, 400);
  const notaCredito = await api(cookies.cajero, "/api/caja/ventas/sin-red", "POST", cuerpo(preparado.usuarios.cajero, turnoCajero, { pagos: [{ metodo: "nota_credito", monto: "50" }] }));
  assert.equal(notaCredito.status, 400);
  const descuentoAlto = await api(cookies.cajero, "/api/caja/ventas/sin-red", "POST", cuerpo(preparado.usuarios.cajero, turnoCajero, {
    totalCobrado: "25.00", partidas: [{ productoId: String(preparado.producto.id), cantidad: "1", descuento: "25" }], pagos: [{ metodo: "efectivo", monto: "25" }],
  }));
  assert.equal(descuentoAlto.status, 403);
  const rechazos = await transaccionTenant(orgId, (tx) => tx.colaCajaRechazo.findMany({ orderBy: { id: "asc" } }));
  assert.equal(rechazos.filter((fila) => fila.uuidCliente === vieja.uuidCliente).length, 1, "reenviar no duplica el rechazo");
  assert.ok(rechazos.length >= 5);
  assert.equal((rechazos.find((fila) => fila.uuidCliente === vieja.uuidCliente)!.payload as { folio: string }).folio, vieja.folio);

  // Precio distinto: se respeta lo cobrado y queda marcada.
  const barata = await api(cookies.cajero, "/api/caja/ventas/sin-red", "POST", cuerpo(preparado.usuarios.cajero, turnoCajero, { totalCobrado: "45.00", pagos: [{ metodo: "efectivo", monto: "50" }] }));
  assert.equal(barata.status, 201);
  assert.equal(barata.data.venta.total, "45");
  assert.deepEqual(barata.data.venta.revisionMotivos, ["precio_distinto"]);
  assert.equal(barata.data.venta.cambio, "5");

  // Ticket de la venta subida (mismo folio SR-) y corte X con todo lo anterior.
  const ticket = await fetch(`${baseUrl}/caja/ticket/${primera.data.venta.id}`, { headers: { Cookie: cookies.cajero } });
  assert.equal(ticket.status, 200);
  assert.match(await ticket.text(), new RegExp(venta1.folio));
  const corte = await api(cookies.cajero, `/api/caja/turnos/${turnoCajero}/corte`);
  assert.equal(corte.status, 200);
  assert.equal(corte.data.corte.ventas, 2);
  assert.equal(corte.data.corte.efectivoEsperado, "195", "100 de fondo + 50 + (50 − 5 de cambio)");

  // Se vuelve a apagar: el endpoint y el catálogo cierran sin tocar lo ya subido.
  assert.equal((await api(cookies.admin, "/api/modulos", "PATCH", { clave: "caja", config: { ventasSinRed: false } })).status, 200);
  assert.equal((await api(cookies.cajero, "/api/caja/ventas/sin-red", "POST", cuerpo(preparado.usuarios.cajero, turnoCajero))).data.codigo, "SIN_RED_APAGADO");

  console.log(JSON.stringify({
    apagado: { subida: apagado.status, catalogo: 403 }, soloAdminEnciende: true, subida: primera.status, reenvio: repetida.status, ventasGuardadas: ventas,
    identidadAjena: ajena.status, turnoAjeno: turnoAjeno.data.codigo, rechazosRegistrados: rechazos.length, precioDistinto: barata.data.venta.revisionMotivos,
    corteX: corte.data.corte.efectivoEsperado,
  }));
}

async function limpiar() {
  await admin.query("SET session_replication_role = replica");
  try {
    const tablas = await admin.query<{ table_name: string }>("SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'org_id'");
    for (const { table_name } of tablas.rows) await admin.query(`DELETE FROM "${table_name.replaceAll('"', '""')}" WHERE org_id = $1`, [String(orgId)]);
    await admin.query("DELETE FROM orgs WHERE id = $1", [String(orgId)]);
  } finally { await admin.query("SET session_replication_role = origin"); }
}

main().catch((error) => { console.error("FALLO:", error); process.exitCode = 1; }).finally(async () => {
  await limpiar().catch(console.error);
  await Promise.all([dbRaw.$disconnect(), admin.end()]);
});
