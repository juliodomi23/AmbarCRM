import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import pg from "pg";
import { dbRaw } from "../../src/lib/db";
import { bloquearProductos, transaccionTenant } from "../../src/lib/retail-db";

const { Pool } = pg;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
if (!adminUrl) throw new Error("Define ADMIN_DATABASE_URL con el usuario dueño");
const admin = new Pool({ connectionString: adminUrl, max: 1 });
const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const orgId = BigInt(Date.now()) * 1000n + 617n;
const orgAjenaId = orgId + 1n;
const slug = `e2e-caja-${sufijo}`;
const email = `cajero-${sufijo}@test.local`;
const emailEncargado = `encargado-${sufijo}@test.local`;
const password = "Caja-E2E-2026!";

function cookiesDe(respuesta: Response) {
  const headers = respuesta.headers as Headers & { getSetCookie?: () => string[] };
  const valores = headers.getSetCookie?.() ?? (respuesta.headers.get("set-cookie") ? [respuesta.headers.get("set-cookie")!] : []);
  return valores.map((valor) => valor.split(";", 1)[0]).join("; ");
}

function combinarCookies(actual: string, nuevas: string) {
  const mapa = new Map<string, string>();
  for (const parte of `${actual}; ${nuevas}`.split(";").map((p) => p.trim()).filter(Boolean)) mapa.set(parte.split("=", 1)[0], parte);
  return [...mapa.values()].join("; ");
}

async function peticion(ruta: string, cookie: string, method = "GET", body?: unknown) {
  const respuesta = await fetch(`${baseUrl}${ruta}`, {
    method,
    redirect: "manual",
    headers: { Cookie: cookie, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { respuesta, data: await respuesta.json().catch(() => ({})) };
}

async function preparar() {
  await admin.query("INSERT INTO orgs (id, nombre, slug) VALUES ($1, 'E2E Caja', $2)", [orgId.toString(), slug]);
  return transaccionTenant(orgId, async (tx) => {
    const passwordHash = await bcrypt.hash(password, 10);
    const usuario = await tx.usuario.create({ data: { nombre: "Cajero E2E", email, passwordHash, rol: "agente", puesto: "Cajero" } });
    const encargado = await tx.usuario.create({ data: { nombre: "Encargado E2E", email: emailEncargado, passwordHash, rol: "agente", puesto: "Encargado de tienda" } });
    const otroCajero = await tx.usuario.create({ data: { nombre: "Otro cajero E2E", email: `otro-${sufijo}@test.local`, passwordHash, rol: "agente", puesto: "Cajero" } });
    for (const clave of ["productos", "ventas"]) await tx.moduloOrg.create({ data: { clave, activo: true, config: {} } });
    await tx.moduloOrg.create({ data: { clave: "caja", activo: true, config: { puestosPermitidos: ["Cajero", "Encargado de tienda"], descuentoMaximoCajero: 10 } } });
    const caja = await tx.caja.create({ data: { nombre: "Caja E2E", sucursal: "Pruebas" } });
    const cajaAjena = await tx.caja.create({ data: { nombre: "Caja de otro cajero", sucursal: "Pruebas" } });
    const turnoAjeno = await tx.turnoCaja.create({
      data: { cajaId: cajaAjena.id, usuarioId: otroCajero.id, fondoInicial: 100 },
    });
    const pieza = await tx.producto.create({ data: { sku: `PZA-${sufijo}`, codigoBarras: `750${Date.now()}`, nombre: "Producto por pieza", precio: 100, stock: 0 } });
    const peso = await tx.producto.create({ data: { sku: `KG-${sufijo}`, nombre: "Producto por peso", precio: 200, stock: 0, unidad: "kg", vendePorPeso: true } });
    await bloquearProductos(tx, [pieza.id, peso.id]);
    await tx.producto.update({ where: { id: pieza.id }, data: { stock: 3 } });
    await tx.producto.update({ where: { id: peso.id }, data: { stock: 2 } });
    return { usuario, encargado, otroCajero, caja, cajaAjena, turnoAjeno, pieza, peso };
  });
}

async function crearVentaAjena() {
  await admin.query("INSERT INTO orgs (id, nombre, slug) VALUES ($1, 'E2E Caja ajena', $2)", [
    orgAjenaId.toString(),
    `e2e-caja-ajena-${sufijo}`,
  ]);
  return transaccionTenant(orgAjenaId, async (tx) => {
    const usuario = await tx.usuario.create({
      data: {
        nombre: "Cajero ajeno",
        email: `ajeno-${sufijo}@test.local`,
        passwordHash: "sin-login",
        puesto: "Cajero",
      },
    });
    const caja = await tx.caja.create({ data: { nombre: "Caja ajena" } });
    const turno = await tx.turnoCaja.create({
      data: { cajaId: caja.id, usuarioId: usuario.id, fondoInicial: 0 },
    });
    return tx.venta.create({
      data: {
        folio: `AJENA-${sufijo}`,
        cajaId: caja.id,
        turnoId: turno.id,
        creadoPorId: usuario.id,
        estado: "pagada",
        subtotal: 10,
        total: 10,
      },
    });
  });
}

async function login(correo: string) {
  const csrf = await fetch(`${baseUrl}/api/auth/csrf`);
  let cookie = cookiesDe(csrf);
  const token = (await csrf.json()).csrfToken;
  const cuerpo = new URLSearchParams({ csrfToken: token, email: correo, password, orgSlug: slug, callbackUrl: `${baseUrl}/caja`, json: "true" });
  const respuesta = await fetch(`${baseUrl}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" }, body: cuerpo });
  cookie = combinarCookies(cookie, cookiesDe(respuesta));
  assert.ok(cookie.includes("next-auth.session-token") || cookie.includes("__Secure-next-auth.session-token"), "el login real debe entregar cookie de sesión");
  return cookie;
}

async function main() {
  const base = await preparar();
  const ventaAjena = await crearVentaAjena();
  const cookie = await login(email);
  const cookieEncargado = await login(emailEncargado);
  const sesion = await peticion("/api/auth/session", cookie);
  assert.equal(sesion.data.user.puesto, "Cajero");

  const corteAjenoCajero = await peticion(`/api/caja/turnos/${base.turnoAjeno.id}/corte`, cookie);
  assert.equal(corteAjenoCajero.respuesta.status, 404);
  const corteAjenoEncargado = await peticion(`/api/caja/turnos/${base.turnoAjeno.id}/corte`, cookieEncargado);
  assert.equal(corteAjenoEncargado.respuesta.status, 200);
  const turnosCajero = await peticion("/api/caja/turnos", cookie);
  assert.ok(turnosCajero.data.recientes.every((turno: { usuarioId: string }) => turno.usuarioId === String(base.usuario.id)));
  const turnosEncargado = await peticion("/api/caja/turnos", cookieEncargado);
  assert.ok(turnosEncargado.data.recientes.some((turno: { id: string }) => turno.id === String(base.turnoAjeno.id)));
  const cierreAjeno = await peticion(`/api/caja/turnos/${base.turnoAjeno.id}/corte`, cookieEncargado, "POST", { efectivoContado: "100" });
  assert.equal(cierreAjeno.respuesta.status, 200);

  const apertura = await peticion("/api/caja/turnos", cookie, "POST", { cajaId: String(base.caja.id), fondoInicial: "500" });
  assert.equal(apertura.respuesta.status, 201);
  const turnoId = apertura.data.turno.id;

  const venta = await peticion("/api/caja/ventas", cookie, "POST", {
    turnoId,
    uuidCliente: `e2e-${sufijo}`,
    partidas: [
      { productoId: String(base.pieza.id), cantidad: "1", descuento: "0" },
      { productoId: String(base.peso.id), cantidad: "0.500", descuento: "0" },
    ],
    pagos: [{ metodo: "efectivo", monto: "120" }, { metodo: "tarjeta", monto: "100" }],
    descuento: "0",
  });
  assert.equal(venta.respuesta.status, 201);
  assert.equal(Number(venta.data.venta.total), 200);
  assert.equal(Number(venta.data.venta.cambio), 20);
  assert.equal(venta.data.venta.pagos.length, 2);

  const ticketPropio = await peticion(`/caja/ticket/${venta.data.venta.id}`, cookie);
  assert.equal(ticketPropio.respuesta.status, 200);
  const ticketAjeno = await peticion(`/caja/ticket/${ventaAjena.id}`, cookie);
  assert.equal(ticketAjeno.respuesta.status, 404);

  const cancelar = await peticion(`/api/ventas/${venta.data.venta.id}`, cookie, "PATCH", { estado: "cancelada" });
  assert.equal(cancelar.respuesta.status, 403);

  const corteX = await peticion(`/api/caja/turnos/${turnoId}/corte`, cookie);
  assert.equal(corteX.respuesta.status, 200);
  assert.equal(Number(corteX.data.corte.efectivoEsperado), 600);
  const corteZ = await peticion(`/api/caja/turnos/${turnoId}/corte`, cookie, "POST", { efectivoContado: "590" });
  assert.equal(corteZ.respuesta.status, 200);
  assert.equal(Number(corteZ.data.corte.diferencia), -10);
  const cancelarTrasCorte = await peticion(`/api/ventas/${venta.data.venta.id}`, cookieEncargado, "PATCH", { estado: "cancelada" });
  assert.equal(cancelarTrasCorte.respuesta.status, 409);
  assert.equal(cancelarTrasCorte.data.error, "Este turno ya tuvo corte; registra una devolución");

  const estado = await transaccionTenant(orgId, async (tx) => ({
    pieza: Number((await tx.producto.findUniqueOrThrow({ where: { id: base.pieza.id } })).stock),
    peso: Number((await tx.producto.findUniqueOrThrow({ where: { id: base.peso.id } })).stock),
    turno: await tx.turnoCaja.findUniqueOrThrow({ where: { id: BigInt(turnoId) } }),
  }));
  assert.equal(estado.pieza, 2);
  assert.equal(estado.peso, 1.5);
  assert.equal(estado.turno.estado, "cerrado");
  console.log(JSON.stringify({ login: { puesto: sesion.data.user.puesto }, permisosTurnos: { cajeroCorteAjeno: corteAjenoCajero.respuesta.status, encargadoCorteAjeno: corteAjenoEncargado.respuesta.status, encargadoCierraAjeno: cierreAjeno.respuesta.status, cajeroVeSoloPropios: true, encargadoVeTodos: true }, apertura: apertura.respuesta.status, venta: { pieza: 1, pesoKg: 0.5, total: venta.data.venta.total, pagos: ["efectivo", "tarjeta"], cambio: venta.data.venta.cambio }, ticket: { propio: ticketPropio.respuesta.status, otraEmpresa: ticketAjeno.respuesta.status }, cancelarComoCajero: cancelar.respuesta.status, cancelarTrasCorte: { estado: cancelarTrasCorte.respuesta.status, mensaje: cancelarTrasCorte.data.error }, corteX: { esperado: corteX.data.corte.efectivoEsperado }, corteZ: { contado: 590, diferencia: corteZ.data.corte.diferencia }, stockFinal: { pieza: estado.pieza, pesoKg: estado.peso } }));
}

async function limpiar() {
  await admin.query("SET session_replication_role = replica");
  try {
    const tablas = await admin.query<{ table_name: string }>("SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'org_id'");
    for (const { table_name } of tablas.rows) {
      await admin.query(`DELETE FROM "${table_name.replaceAll('"', '""')}" WHERE org_id IN ($1, $2)`, [
        orgId.toString(),
        orgAjenaId.toString(),
      ]);
    }
    await admin.query("DELETE FROM orgs WHERE id IN ($1, $2)", [orgId.toString(), orgAjenaId.toString()]);
  } finally { await admin.query("SET session_replication_role = origin"); }
}

main().catch((error) => { console.error("FALLO:", error); process.exitCode = 1; }).finally(async () => {
  await limpiar().catch((error) => console.error("No se pudo limpiar:", error));
  await Promise.all([dbRaw.$disconnect(), admin.end()]);
});
