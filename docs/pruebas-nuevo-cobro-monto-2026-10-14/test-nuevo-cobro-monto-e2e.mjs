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
assert.equal(url.pathname, "/crm");
assert.equal(url.username, "crm_app");
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const prisma = new PrismaClient();
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const contexto = await browser.newContext({ baseURL: base, viewport: { width: 1440, height: 1000 } });
const page = await contexto.newPage();
const errores = [];
const medidas = [];
page.on("pageerror", error => errores.push(error.message));
let org;
let fixture;
const modal = page.getByRole("dialog", { name: "Nuevo cobro", exact: true });
const monto = modal.getByRole("spinbutton", { name: "Monto (MXN)", exact: true });
const concepto = modal.getByRole("combobox", { name: "Concepto", exact: true });
const selector = modal.getByRole("combobox", { name: "Contrato", exact: true });
function tenant(fn) { return prisma.$transaction(async tx => { await tx.$executeRaw`SELECT set_config('app.current_org', ${String(org.id)}, true)`; return fn(tx); }); }
async function comprobarMonto(valor) {
  await page.waitForFunction(esperado => document.querySelector('[role="dialog"] input[type="number"]')?.value === esperado, valor, { timeout: 5000 });
  assert.equal(await monto.inputValue(), valor);
}
async function abrirLista() {
  await page.goto("/cobros", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Nuevo cobro", exact: true }).click();
  await selector.locator(`option[value="${fixture.c800.id}"]`).waitFor({ state: "attached" });
}
async function captura(ancho, vista) {
  await modal.evaluate(async el => { await Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished)); });
  await modal.locator("form > div").first().evaluate(el => { el.scrollTop = 0; });
  const medida = await page.evaluate(() => {
    const dialogo = document.querySelector('[role="dialog"]');
    const formulario = dialogo.querySelector("form");
    const caja = formulario.getBoundingClientRect();
    return { viewport: innerWidth, documento: document.documentElement.scrollWidth, formulario: formulario.scrollWidth, anchoFormulario: formulario.clientWidth, izquierda: caja.left, derecha: caja.right };
  });
  assert.equal(medida.documento, ancho, `${vista}: sin desbordes de página`);
  assert.equal(medida.formulario, medida.anchoFormulario, `${vista}: sin desbordes del formulario`);
  assert.ok(medida.izquierda >= 0 && medida.derecha <= ancho);
  const limites = await modal.locator("form").boundingBox();
  for (const boton of await modal.getByRole("button").all()) {
    const caja = await boton.boundingBox();
    assert.ok(caja.height >= 44);
    assert.ok(caja.y >= limites.y && caja.y + caja.height <= limites.y + limites.height, "botón completo dentro del formulario, sin recorte");
    assert.ok(caja.y + caja.height <= await page.evaluate(() => innerHeight), "botón dentro del viewport");
  }
  medidas.push({ vista, ancho, ...medida });
  await page.screenshot({ path: fileURLToPath(new URL(`${vista}-${ancho}.png`, import.meta.url)) });
}

try {
  const [rol] = await prisma.$queryRaw`SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user`;
  assert.deepEqual(rol, { rolname: "crm_app", rolsuper: false, rolbypassrls: false });
  org = await prisma.org.create({ data: { nombre: "Nuevo cobro · pruebas locales", slug: `nuevo-cobro-${Date.now()}` } });
  fixture = await tenant(async tx => {
    await tx.moduloOrg.createMany({ data: ["contratos", "cobros", "panel_ar"].map(clave => ({ clave, activo: true })) });
    await tx.ajustes.create({ data: { marcaNombre: "Ámbar Rojo · pruebas locales" } });
    await tx.usuario.create({ data: { nombre: "Admin pruebas", email: "admin@nuevo-cobro.local.test", passwordHash: await bcrypt.hash("Nuevo-Cobro-2026", 10), rol: "admin", puesto: "Administrador" } });
    const cliente = await tx.contacto.create({ data: { nombre: "Villafuerte y Asociados" } });
    const c1200 = await tx.contrato.create({ data: { contactoId: cliente.id, tipo: "bot_whatsapp", estado: "produccion", mensualidad: "1200", diaCobro: 5 } });
    const c800 = await tx.contrato.create({ data: { contactoId: cliente.id, tipo: "otro", estado: "produccion", mensualidad: "800", diaCobro: 5 } });
    const sinMensualidad = await tx.contrato.create({ data: { contactoId: cliente.id, tipo: "web", estado: "produccion" } });
    const mensualidadCero = await tx.contrato.create({ data: { contactoId: cliente.id, tipo: "seo", estado: "produccion", mensualidad: "0" } });
    const ahora = new Date();
    const cancelado = await tx.cobro.create({ data: { contratoId: c800.id, concepto: "extra", monto: "100", montoPagado: "40", estado: "cancelado", pagos: [{ clave: "pago-revertido", monto: "40", pagadoEn: ahora.toISOString(), metodo: "efectivo", referencia: null }] } });
    const pagado = await tx.cobro.create({ data: { contratoId: c1200.id, concepto: "extra", monto: "50", montoPagado: "50", estado: "pagado", pagadoEn: ahora, pagos: [{ clave: "pago-vigente", monto: "50", pagadoEn: ahora.toISOString(), metodo: "efectivo", referencia: null }] } });
    return { c1200, c800, sinMensualidad, mensualidadCero, cancelado, pagado };
  });
  const csrf = await contexto.request.get("/api/auth/csrf");
  const { csrfToken } = await csrf.json();
  await contexto.request.post("/api/auth/callback/credentials", { form: { csrfToken, email: "admin@nuevo-cobro.local.test", password: "Nuevo-Cobro-2026", orgSlug: org.slug, json: "true", callbackUrl: base + "/cobros" } });
  const sesion = await (await contexto.request.get("/api/auth/session")).json();
  assert.equal(sesion.user.orgId, String(org.id));
  await abrirLista();
  const etiquetas = await selector.locator("option").allTextContents();
  assert.ok(etiquetas.includes("Villafuerte y Asociados · bot whatsapp · $1,200/mes · día 5"));
  assert.ok(etiquetas.includes("Villafuerte y Asociados · otro · $800/mes · día 5"));
  assert.ok(etiquetas.includes("Villafuerte y Asociados · web · sin mensualidad · día por confirmar"));
  assert.ok(etiquetas.includes("Villafuerte y Asociados · seo · sin mensualidad · día por confirmar"));
  await selector.selectOption(String(fixture.c1200.id));
  await comprobarMonto("");
  await concepto.selectOption("mensualidad");
  await comprobarMonto("1200");
  await selector.selectOption(String(fixture.c800.id));
  await comprobarMonto("800");
  for (const valor of ["extra", "anticipo", "balance"]) {
    await concepto.selectOption(valor);
    await comprobarMonto("");
  }
  await concepto.selectOption("mensualidad");
  await comprobarMonto("800");
  await monto.fill("915.50");
  await selector.selectOption(String(fixture.c1200.id));
  await comprobarMonto("915.50");
  await concepto.selectOption("extra");
  await comprobarMonto("915.50");
  await concepto.selectOption("mensualidad");
  await selector.selectOption(String(fixture.c800.id));
  await comprobarMonto("915.50");
  await monto.fill("");
  await concepto.selectOption("balance");
  await concepto.selectOption("mensualidad");
  await comprobarMonto("");
  await monto.fill("950");
  const busqueda = page.waitForResponse(r => r.url().includes("/api/contratos?") && r.url().includes("SinResultados"));
  await modal.getByRole("textbox", { name: "Buscar contrato por cliente o servicio" }).fill("SinResultados");
  await busqueda;
  await selector.locator("option").filter({ hasText: "$1,200/mes" }).waitFor({ state: "detached" });
  assert.equal(await selector.inputValue(), String(fixture.c800.id));
  await comprobarMonto("950");
  assert.equal(await selector.locator(`option[value="${fixture.c800.id}"]`).count(), 1);
  console.log("OK: selector distingue 1200/800 y día 5; 800 propone 800, no 1200; extra/anticipo/balance vacíos; monto manual y borrado manual se conservan al cambiar contrato/concepto/búsqueda");

  await page.reload({ waitUntil: "networkidle" });
  await abrirLista();
  await concepto.selectOption("mensualidad");
  for (const c of [fixture.sinMensualidad, fixture.mensualidadCero]) {
    await selector.selectOption(String(c.id));
    await comprobarMonto("");
  }
  await selector.selectOption(String(fixture.c800.id));
  await comprobarMonto("800");
  await modal.locator('input[type="month"]').fill("2099-02");
  const alta = page.waitForResponse(r => r.url().endsWith("/api/cobros") && r.request().method() === "POST");
  await modal.getByRole("button", { name: "Crear cobro", exact: true }).click();
  const respuesta = await alta;
  assert.equal(respuesta.status(), 201);
  const payload = respuesta.request().postDataJSON();
  assert.equal(payload.contratoId, String(fixture.c800.id));
  assert.equal(payload.monto, "800");
  await page.getByRole("status").filter({ hasText: "Cobro creado · Villafuerte y Asociados · mensualidad · $800 MXN" }).waitFor();
  const almacenado = await tenant(tx => tx.cobro.findFirstOrThrow({ where: { concepto: "mensualidad", periodo: new Date("2099-02-01T00:00:00Z") } }));
  assert.equal(almacenado.contratoId, fixture.c800.id);
  assert.equal(almacenado.monto.toString(), "800");
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Nuevo cobro", exact: true }).click();
  await comprobarMonto("");
  await modal.getByRole("button", { name: "Cancelar", exact: true }).click();
  console.log("OK: sin mensualidad (null/0) sin propuesta; POST real guarda contrato 800/monto 800; aviso muestra cliente, concepto e importe; siguiente alta empieza vacía");

  for (const ancho of [375, 1440]) {
    await page.setViewportSize({ width: ancho, height: ancho === 375 ? 900 : 1000 });
    await abrirLista();
    await selector.selectOption(String(fixture.c800.id));
    await concepto.selectOption("mensualidad");
    await comprobarMonto("800");
    await modal.locator('input[type="month"]').fill("2099-03");
    await captura(ancho, "nuevo-cobro");
    await modal.getByRole("button", { name: "Cancelar", exact: true }).click();
    const cancelado = page.locator(`[data-cobro-id="${fixture.cancelado.id}"]`);
    assert.match(await cancelado.innerText(), /Pago revertido · \$40\.00/);
    assert.equal((await cancelado.innerText()).includes("Recibido"), false);
    assert.match(await page.locator(`[data-cobro-id="${fixture.pagado.id}"]`).innerText(), /Recibido \$50\.00 de \$50\.00/);
    await page.goto(`/contratos/${fixture.c800.id}`, { waitUntil: "networkidle" });
    const detalle = page.waitForResponse(r => new URL(r.url()).pathname === `/api/contratos/${fixture.c800.id}`);
    await page.getByRole("button", { name: "Nuevo cobro", exact: true }).click();
    await detalle;
    assert.equal(await selector.count(), 0);
    await concepto.selectOption("mensualidad");
    await comprobarMonto("800");
    await modal.locator('input[type="month"]').fill("2099-04");
    await captura(ancho, "nuevo-cobro-ficha");
    await modal.getByRole("button", { name: "Cancelar", exact: true }).click();
  }
  console.log("OK: capturas de lista y ficha a 375/1440; ficha contratoId 800 propone 800; cancelado muestra Pago revertido y pagado conserva Recibido; sin desbordes");

  await page.goto(`/contratos/${fixture.c800.id}`, { waitUntil: "networkidle" });
  await page.reload({ waitUntil: "networkidle" });
  let liberar;
  const bloqueo = new Promise(resolve => { liberar = resolve; });
  const filtro = `**/api/contratos/${fixture.c800.id}`;
  await page.route(filtro, async route => { await bloqueo; await route.continue(); });
  await page.getByRole("button", { name: "Nuevo cobro", exact: true }).click();
  await concepto.selectOption("mensualidad");
  await comprobarMonto("");
  await monto.fill("925");
  const respuestaTardia = page.waitForResponse(r => new URL(r.url()).pathname === `/api/contratos/${fixture.c800.id}`);
  liberar();
  await respuestaTardia;
  await modal.getByRole("button", { name: "Crear cobro", exact: true }).waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] button')].find(b => b.textContent === "Crear cobro")?.disabled === false);
  await comprobarMonto("925");
  await page.unroute(filtro);
  assert.deepEqual(errores, []);
  console.log("OK: monto manual 925 preservado incluso cuando el contrato de la ficha llega tarde; sin errores JS");
  console.log(JSON.stringify({ medidas, errores }, null, 2));
} finally {
  await writeFile(new URL("visual.json", import.meta.url), JSON.stringify({ medidas, errores }, null, 2));
  if (org) {
    await tenant(async tx => {
      await tx.cobro.deleteMany();
      await tx.contrato.deleteMany();
      await tx.contacto.deleteMany();
      await tx.ajustes.deleteMany();
      await tx.usuario.deleteMany();
      await tx.moduloOrg.deleteMany();
    });
    await prisma.org.delete({ where: { id: org.id } });
  }
  await browser.close();
  await prisma.$disconnect();
}
