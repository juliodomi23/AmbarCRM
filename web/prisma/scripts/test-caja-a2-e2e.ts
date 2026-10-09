import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import pg from "pg";
import { dbRaw } from "../../src/lib/db";
import { bloquearProductos, transaccionTenant } from "../../src/lib/retail-db";

const { Pool } = pg;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3117";
if (!adminUrl) throw new Error("Define ADMIN_DATABASE_URL con el usuario dueño");
const admin = new Pool({ connectionString: adminUrl, max: 1 });
const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const orgId = BigInt(Date.now()) * 1000n + 931n;
const slug = `e2e-caja-a2-${sufijo}`;
const emailCajero = `cajero-a2-${sufijo}@test.local`;
const emailEncargado = `encargado-a2-${sufijo}@test.local`;
const password = "Caja-A2-E2E-2026!";

function cookiesDe(respuesta: Response) {
  const headers = respuesta.headers as Headers & { getSetCookie?: () => string[] };
  const valores = headers.getSetCookie?.() ?? (respuesta.headers.get("set-cookie") ? [respuesta.headers.get("set-cookie")!] : []);
  return valores.map((valor) => valor.split(";", 1)[0]).join("; ");
}

function combinarCookies(actual: string, nuevas: string) {
  const mapa = new Map<string, string>();
  for (const parte of `${actual}; ${nuevas}`.split(";").map((item) => item.trim()).filter(Boolean)) mapa.set(parte.split("=", 1)[0], parte);
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

async function login(email: string) {
  const csrf = await fetch(`${baseUrl}/api/auth/csrf`);
  let cookie = cookiesDe(csrf);
  const token = (await csrf.json()).csrfToken;
  const body = new URLSearchParams({ csrfToken: token, email, password, orgSlug: slug, callbackUrl: `${baseUrl}/caja`, json: "true" });
  const respuesta = await fetch(`${baseUrl}/api/auth/callback/credentials`, { method: "POST", redirect: "manual", headers: { Cookie: cookie, "Content-Type": "application/x-www-form-urlencoded" }, body });
  cookie = combinarCookies(cookie, cookiesDe(respuesta));
  assert.ok(cookie.includes("next-auth.session-token") || cookie.includes("__Secure-next-auth.session-token"));
  return cookie;
}

async function preparar() {
  await admin.query("INSERT INTO orgs (id, nombre, slug) VALUES ($1, 'E2E Caja A2', $2)", [orgId.toString(), slug]);
  return transaccionTenant(orgId, async (tx) => {
    const passwordHash = await bcrypt.hash(password, 10);
    const cajero = await tx.usuario.create({ data: { nombre: "Cajero A2", email: emailCajero, passwordHash, puesto: "Cajero" } });
    const encargado = await tx.usuario.create({ data: { nombre: "Encargado A2", email: emailEncargado, passwordHash, puesto: "Encargado de tienda" } });
    for (const clave of ["productos", "ventas"]) await tx.moduloOrg.create({ data: { clave, activo: true, config: {} } });
    await tx.moduloOrg.create({ data: { clave: "caja", activo: true, config: { apartadoDiasVigencia: 7, descuentoMaximoCajero: 10 } } });
    const cajas = await Promise.all(["Original", "Actual", "Encargado"].map((nombre) => tx.caja.create({ data: { nombre: `${nombre}-${sufijo}` } })));
    const contacto = await tx.contacto.create({ data: { nombre: "Cliente E2E A2", telefono: `962${String(Date.now()).slice(-7)}` } });
    const productos = await Promise.all([
      tx.producto.create({ data: { sku: `DEV-${sufijo}`, nombre: "Devolución E2E", precio: 100, stock: 0 } }),
      tx.producto.create({ data: { sku: `CAM-${sufijo}`, nombre: "Cambio E2E", precio: 30, stock: 0 } }),
      tx.producto.create({ data: { sku: `APA-${sufijo}`, nombre: "Apartado E2E", precio: 120, stock: 0 } }),
      tx.producto.create({ data: { sku: `VEN-${sufijo}`, nombre: "Vencimiento E2E", precio: 90, stock: 0 } }),
      tx.producto.create({ data: { sku: `CRE-${sufijo}`, nombre: "Crédito E2E", precio: 80, stock: 0 } }),
      tx.producto.create({ data: { sku: `NOT-${sufijo}`, nombre: "Nota E2E", precio: 40, stock: 0 } }),
    ]);
    await bloquearProductos(tx, productos.map((producto) => producto.id));
    for (const producto of productos) await tx.producto.update({ where: { id: producto.id }, data: { stock: producto.id === productos[4].id ? 4 : 1 } });
    return { cajero, encargado, cajas, contacto, productos };
  });
}

async function ventaCaja(cookie: string, turnoId: string, productoId: bigint, precio: string, uuid: string) {
  const resultado = await peticion("/api/caja/ventas", cookie, "POST", {
    turnoId,
    contactoId: String(base.contacto.id),
    uuidCliente: uuid,
    partidas: [{ productoId: String(productoId), cantidad: "1", descuento: "0" }],
    pagos: [{ metodo: "efectivo", monto: precio }],
    descuento: "0",
  });
  assert.equal(resultado.respuesta.status, 201);
  return resultado.data.venta;
}

let base: Awaited<ReturnType<typeof preparar>>;

async function main() {
  base = await preparar();
  const [cookieCajero, cookieEncargado] = await Promise.all([login(emailCajero), login(emailEncargado)]);
  const aperturaOriginal = await peticion("/api/caja/turnos", cookieCajero, "POST", { cajaId: String(base.cajas[0].id), fondoInicial: "0" });
  assert.equal(aperturaOriginal.respuesta.status, 201);
  const ventaOriginal = await ventaCaja(cookieCajero, aperturaOriginal.data.turno.id, base.productos[0].id, "100", `original-${sufijo}`);
  const cierreOriginal = await peticion(`/api/caja/turnos/${aperturaOriginal.data.turno.id}/corte`, cookieCajero, "POST", { efectivoContado: "100" });
  assert.equal(cierreOriginal.respuesta.status, 200);
  const aperturaActual = await peticion("/api/caja/turnos", cookieCajero, "POST", { cajaId: String(base.cajas[1].id), fondoInicial: "50" });
  assert.equal(aperturaActual.respuesta.status, 201);
  const turnoActualId = aperturaActual.data.turno.id;
  const ventaCambio = await ventaCaja(cookieCajero, turnoActualId, base.productos[1].id, "30", `cambio-${sufijo}`);
  const devolucion = await peticion("/api/caja/devoluciones", cookieCajero, "POST", {
    ventaId: ventaOriginal.id,
    ventaCambioId: ventaCambio.id,
    tipoReembolso: "efectivo",
    partidas: [{ ventaPartidaId: ventaOriginal.partidas[0].id, cantidad: "1" }],
  });
  assert.equal(devolucion.respuesta.status, 201);
  assert.equal(devolucion.data.devolucion.turnoId, turnoActualId);
  assert.equal(devolucion.data.devolucion.ventaCambio.id, ventaCambio.id);

  const ventaNota = await ventaCaja(cookieCajero, turnoActualId, base.productos[5].id, "40", `nota-${sufijo}`);
  const nota = await peticion("/api/caja/devoluciones", cookieCajero, "POST", {
    ventaId: ventaNota.id,
    tipoReembolso: "nota_credito",
    partidas: [{ ventaPartidaId: ventaNota.partidas[0].id, cantidad: "1" }],
  });
  assert.equal(nota.respuesta.status, 201);
  assert.equal(Number(nota.data.devolucion.notaCredito.saldo), 40);

  const apartado = await peticion("/api/caja/apartados", cookieCajero, "POST", {
    turnoId: turnoActualId,
    contactoId: String(base.contacto.id),
    uuidCliente: `apartado-${sufijo}`,
    anticipo: "20",
    metodo: "tarjeta",
    partidas: [{ productoId: String(base.productos[2].id), cantidad: "1", descuento: "0" }],
  });
  assert.equal(apartado.respuesta.status, 201);
  const cancelado = await peticion(`/api/caja/apartados/${apartado.data.apartado.id}`, cookieCajero, "PATCH", { accion: "cancelar", forma: "sin_reembolso" });
  assert.equal(cancelado.respuesta.status, 200);

  const vence = await peticion("/api/caja/apartados", cookieCajero, "POST", {
    turnoId: turnoActualId,
    contactoId: String(base.contacto.id),
    uuidCliente: `vence-${sufijo}`,
    anticipo: "10",
    metodo: "transferencia",
    partidas: [{ productoId: String(base.productos[3].id), cantidad: "1", descuento: "0" }],
  });
  assert.equal(vence.respuesta.status, 201);
  await transaccionTenant(orgId, (tx) => tx.apartado.update({ where: { id: BigInt(vence.data.apartado.id) }, data: { venceAt: new Date(Date.now() - 60_000) } }));
  const vencimiento = await peticion("/api/caja/apartados/vencer", cookieCajero, "POST");
  assert.equal(vencimiento.respuesta.status, 200);
  assert.equal(vencimiento.data.vencidos, 1);

  const limiteCajero = await peticion(`/api/caja/credito/${base.contacto.id}`, cookieCajero, "PATCH", { limiteCredito: "100" });
  assert.equal(limiteCajero.respuesta.status, 403);
  const limiteEncargado = await peticion(`/api/caja/credito/${base.contacto.id}`, cookieEncargado, "PATCH", { limiteCredito: "100" });
  assert.equal(limiteEncargado.respuesta.status, 200);
  const credito1 = await peticion("/api/caja/credito/ventas", cookieCajero, "POST", {
    turnoId: turnoActualId,
    contactoId: String(base.contacto.id),
    uuidCliente: `credito-1-${sufijo}`,
    partidas: [{ productoId: String(base.productos[4].id), cantidad: "1", descuento: "0" }],
  });
  assert.equal(credito1.respuesta.status, 201);
  const credito2 = await peticion("/api/caja/credito/ventas", cookieCajero, "POST", {
    turnoId: turnoActualId,
    contactoId: String(base.contacto.id),
    uuidCliente: `credito-2-${sufijo}`,
    partidas: [{ productoId: String(base.productos[4].id), cantidad: "1", descuento: "0" }],
  });
  assert.equal(credito2.respuesta.status, 403);
  const abono = await peticion("/api/caja/credito/abonos", cookieCajero, "POST", { turnoId: turnoActualId, contactoId: String(base.contacto.id), monto: "30", metodo: "efectivo" });
  assert.equal(abono.respuesta.status, 201);
  const cuenta = await peticion(`/api/caja/credito/${base.contacto.id}`, cookieCajero);
  assert.equal(cuenta.respuesta.status, 200);
  assert.equal(Number(cuenta.data.cuenta.saldo), 50);
  const recordatorio = await peticion(`/api/caja/credito/${base.contacto.id}/recordatorio`, cookieCajero, "POST");
  assert.equal(recordatorio.respuesta.status, 409);

  const aperturaEncargado = await peticion("/api/caja/turnos", cookieEncargado, "POST", { cajaId: String(base.cajas[2].id), fondoInicial: "0" });
  assert.equal(aperturaEncargado.respuesta.status, 201);
  const creditoSobreLimite = await peticion("/api/caja/credito/ventas", cookieEncargado, "POST", {
    turnoId: aperturaEncargado.data.turno.id,
    contactoId: String(base.contacto.id),
    uuidCliente: `credito-encargado-${sufijo}`,
    partidas: [{ productoId: String(base.productos[4].id), cantidad: "1", descuento: "0" }],
  });
  assert.equal(creditoSobreLimite.respuesta.status, 201);

  const estado = await transaccionTenant(orgId, async (tx) => ({
    turnoOriginal: await tx.turnoCaja.findUniqueOrThrow({ where: { id: BigInt(aperturaOriginal.data.turno.id) } }),
    salidasOriginal: await tx.movimientoCaja.count({ where: { turnoId: BigInt(aperturaOriginal.data.turno.id), tipo: "salida" } }),
    salidasActual: await tx.movimientoCaja.count({ where: { turnoId: BigInt(turnoActualId), tipo: "salida" } }),
    entradasAbono: await tx.movimientoCaja.count({ where: { turnoId: BigInt(turnoActualId), tipo: "entrada", motivo: { startsWith: "Abono a crédito" } } }),
    stockApartado: Number((await tx.producto.findUniqueOrThrow({ where: { id: base.productos[2].id } })).stock),
    stockVencido: Number((await tx.producto.findUniqueOrThrow({ where: { id: base.productos[3].id } })).stock),
    saldoCredito: Number((await tx.cuentaCliente.findUniqueOrThrow({ where: { contactoId: base.contacto.id } })).saldo),
  }));
  assert.equal(estado.turnoOriginal.estado, "cerrado");
  assert.equal(estado.salidasOriginal, 0);
  assert.equal(estado.salidasActual, 1);
  assert.equal(estado.entradasAbono, 1);
  assert.equal(estado.stockApartado, 1);
  assert.equal(estado.stockVencido, 1);
  assert.equal(estado.saldoCredito, 130);

  console.log(JSON.stringify({
    loginReal: { cajero: true, encargado: true },
    devolucionTurnoCerrado: { turnoOriginal: "cerrado", salidasOriginal: estado.salidasOriginal, salidasTurnoActual: estado.salidasActual, cambioLigado: true },
    notaCredito: { saldo: nota.data.devolucion.notaCredito.saldo },
    apartados: { cancelacionLiberaStock: estado.stockApartado, vencimientoLiberaStock: estado.stockVencido },
    credito: { cajeroConfiguraLimite: limiteCajero.respuesta.status, cajeroSobreLimite: credito2.respuesta.status, encargadoSobreLimite: creditoSobreLimite.respuesta.status, abonoEntraAlTurno: estado.entradasAbono, saldoFinal: estado.saldoCredito },
    whatsappSinConversacionOficial: recordatorio.respuesta.status,
  }));
}

async function limpiar() {
  await admin.query("SET session_replication_role = replica");
  try {
    const tablas = await admin.query<{ table_name: string }>("SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'org_id'");
    for (const { table_name } of tablas.rows) await admin.query(`DELETE FROM "${table_name.replaceAll('"', '""')}" WHERE org_id = $1`, [orgId.toString()]);
    await admin.query("DELETE FROM orgs WHERE id = $1", [orgId.toString()]);
  } finally { await admin.query("SET session_replication_role = origin"); }
}

main().catch((error) => { console.error("FALLO:", error); process.exitCode = 1; }).finally(async () => {
  await limpiar().catch((error) => console.error("No se pudo limpiar:", error));
  await Promise.all([dbRaw.$disconnect(), admin.end()]);
});
