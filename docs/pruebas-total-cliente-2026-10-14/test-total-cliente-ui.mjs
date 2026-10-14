import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import bcrypt from "../../web/node_modules/bcryptjs/index.js";
import { PrismaClient } from "../../web/node_modules/@prisma/client/default.js";

const base = process.env.E2E_BASE_URL;
const url = new URL(process.env.DATABASE_URL);
assert.equal(new URL(base).hostname, "127.0.0.1");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "55453");
assert.equal(url.username, "crm_app");
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const prisma = new PrismaClient();
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const contexto = await browser.newContext({ baseURL: base });
const page = await contexto.newPage();
const errores = [];
const medidas = [];
page.on("pageerror", error => errores.push(error.message));
let org;
function tenant(fn) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT set_config('app.current_org', ${String(org.id)}, true)`;
    return fn(tx);
  });
}
const abono = (monto, fecha) => ({ clave: `ui-${monto}`, monto, pagadoEn: fecha, metodo: "transferencia", referencia: null });
async function captura(nombre, ancho, contrato) {
  await page.setViewportSize({ width: ancho, height: ancho === 375 ? 2000 : 1000 });
  await page.goto(`/contratos/${contrato}`, { waitUntil: "networkidle" });
  const resumen = page.getByRole("region", { name: "Resumen de cobros del cliente" });
  await resumen.waitFor();
  const articulos = resumen.locator("article");
  if (nombre === "varios-contratos") {
    assert.equal(await articulos.count(), 5);
    assert.equal(await articulos.first().locator("strong").textContent(), "$1,750.35 MXN");
    assert.equal(await articulos.nth(1).locator("strong").textContent(), "$1,200.10 MXN");
    assert.equal(await articulos.nth(2).locator("strong").textContent(), "$449.95 MXN");
    assert.match(await articulos.nth(3).textContent(), /1 mar 2026/);
    assert.equal(await articulos.nth(4).locator("strong").textContent(), "2");
  } else {
    assert.equal(await articulos.count(), 3);
    assert.equal(await articulos.first().locator("strong").textContent(), "$0.00 MXN");
    assert.match(await articulos.first().textContent(), /Sin pagos registrados/);
    assert.equal(await resumen.getByText("Este contrato", { exact: true }).count(), 0);
    assert.equal(await resumen.getByText("Cliente desde", { exact: true }).count(), 0);
  }
  const medida = await resumen.evaluate(el => {
    const cajas = [...el.querySelectorAll("article")].map(articulo => {
      const { x, y, width, height } = articulo.getBoundingClientRect();
      return { x, y, width, height, scrollWidth: articulo.scrollWidth, clientWidth: articulo.clientWidth };
    });
    return { viewport: innerWidth, documento: document.documentElement.scrollWidth, cajas };
  });
  assert.equal(medida.documento, ancho, `${nombre}: sin desborde horizontal`);
  for (const caja of medida.cajas) {
    assert.ok(caja.x >= 0 && caja.x + caja.width <= ancho);
    assert.equal(caja.scrollWidth, caja.clientWidth, "sin desbordes dentro de las tarjetas");
  }
  if (ancho === 375) {
    assert.ok(medida.cajas.every(caja => caja.x === medida.cajas[0].x));
    for (let i = 1; i < medida.cajas.length; i++) assert.ok(medida.cajas[i].y >= medida.cajas[i - 1].y + medida.cajas[i - 1].height);
  } else {
    assert.ok(medida.cajas.every(caja => caja.y === medida.cajas[0].y), "tarjetas en una fila a 1440");
  }
  medidas.push({ nombre, ancho, ...medida });
  await page.screenshot({ path: fileURLToPath(new URL(`${nombre}-${ancho}.png`, import.meta.url)), fullPage: true });
}

try {
  const [rol] = await prisma.$queryRaw`SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user`;
  assert.deepEqual(rol, { rolname: "crm_app", rolsuper: false, rolbypassrls: false });
  org = await prisma.org.create({ data: { nombre: "Total cliente UI local", slug: `total-cliente-ui-${Date.now()}` } });
  const fixture = await tenant(async tx => {
    await tx.moduloOrg.createMany({ data: ["contratos", "cobros", "panel_ar"].map(clave => ({ clave, activo: true })) });
    await tx.ajustes.create({ data: { marcaNombre: "Ámbar Rojo · pruebas locales" } });
    await tx.usuario.create({ data: { nombre: "Admin pruebas", email: "admin@total-cliente.local.test", passwordHash: await bcrypt.hash("Total-Cliente-2026", 10), rol: "admin", puesto: "Administrador" } });
    const cliente = await tx.contacto.create({ data: { nombre: "Villafuerte y Asociados" } });
    const sinPagos = await tx.contacto.create({ data: { nombre: "Cliente sin pagos" } });
    const a = await tx.contrato.create({ data: { contactoId: cliente.id, tipo: "web", estado: "produccion", mensualidad: "1200.10", diaCobro: 5 } });
    const b = await tx.contrato.create({ data: { contactoId: cliente.id, tipo: "bot_whatsapp", estado: "produccion", mensualidad: "500.20", diaCobro: 5 } });
    const vacio = await tx.contrato.create({ data: { contactoId: sinPagos.id, tipo: "web", estado: "en_desarrollo" } });
    await tx.cobro.createMany({ data: [
      { contratoId: a.id, concepto: "mensualidad", periodo: new Date("2026-03-01"), estado: "pagado", monto: "1200.10", montoPagado: "1200.10", pagadoEn: new Date("2026-03-15T18:00:00Z"), pagos: [abono("600", "2026-03-01T18:00:00Z"), abono("600.10", "2026-03-15T18:00:00Z")] },
      { contratoId: b.id, concepto: "mensualidad", periodo: new Date("2026-02-01"), estado: "pagado", monto: "500.20", pagos: [] },
      { contratoId: b.id, concepto: "extra", estado: "vencido", monto: "200", montoPagado: "50.05", pagos: [abono("50.05", "2026-04-01T18:00:00Z")] },
      { contratoId: b.id, concepto: "extra", estado: "pendiente", monto: "300" },
      { contratoId: a.id, concepto: "extra", estado: "cancelado", monto: "900", montoPagado: "900", pagos: [abono("900", "2020-01-01T18:00:00Z")] },
      { contratoId: b.id, concepto: "extra", estado: "incobrable", monto: "500", montoPagado: "25", pagos: [abono("25", "2019-01-01T18:00:00Z")] },
    ] });
    return { a, b, vacio };
  });
  const { csrfToken } = await (await contexto.request.get("/api/auth/csrf")).json();
  await contexto.request.post("/api/auth/callback/credentials", { form: { csrfToken, email: "admin@total-cliente.local.test", password: "Total-Cliente-2026", orgSlug: org.slug, json: "true", callbackUrl: `${base}/cobros` } });
  const sesion = await (await contexto.request.get("/api/auth/session")).json();
  assert.equal(sesion.user.orgId, String(org.id));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/cobros", { waitUntil: "networkidle" });
  const kpi = page.locator("article").filter({ hasText: "Cobrado registrado · todos los periodos" }).locator("strong");
  assert.equal(await kpi.textContent(), "$1750.35", "paridad real del KPI renderizado y la ficha del cliente");
  for (const ancho of [375, 1440]) {
    await captura("varios-contratos", ancho, fixture.a.id);
    await captura("sin-pagos", ancho, fixture.vacio.id);
  }
  await page.goto(`/contratos/${fixture.b.id}`, { waitUntil: "networkidle" });
  const resumenB = page.getByRole("region", { name: "Resumen de cobros del cliente" });
  assert.equal(await resumenB.locator("article").first().locator("strong").textContent(), "$1,750.35 MXN");
  assert.equal(await resumenB.locator("article").nth(1).locator("strong").textContent(), "$550.25 MXN");
  assert.deepEqual(errores, []);
  await writeFile(new URL("visual.json", import.meta.url), JSON.stringify({ medidas, errores }, null, 2));
  console.log("UI OK: paridad con /cobros $1750.35; mismo total en ambas fichas; subtotales $1200.10/$550.25; saldo $449.95; primer abono 1 mar 2026; 2 mensualidades; sin pagos $0.00 y aviso, sin subtotal redundante ni fecha; 4 capturas 375/1440, una columna/fila y sin desbordes ni errores JS.");
} finally {
  if (org) {
    await tenant(async tx => {
      await tx.cobro.deleteMany();
      await tx.contrato.deleteMany();
      await tx.contacto.deleteMany();
      await tx.usuario.deleteMany();
      await tx.moduloOrg.deleteMany();
      await tx.ajustes.deleteMany();
    });
    await prisma.org.delete({ where: { id: org.id } });
  }
  await browser.close();
  await prisma.$disconnect();
}
