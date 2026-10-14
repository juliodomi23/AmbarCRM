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
const contexto = await browser.newContext({ baseURL: base });
const page = await contexto.newPage();
const errores = [];
const medidas = [];
page.on("pageerror", error => errores.push(error.message));
async function tenant(fn) { return prisma.$transaction(async tx => { await tx.$executeRaw`SELECT set_config('app.current_org', '1', true)`; return fn(tx); }); }
let fixture;
async function login(context, email) {
  const csrf = await context.request.get("/api/auth/csrf");
  const { csrfToken } = await csrf.json();
  await context.request.post("/api/auth/callback/credentials", { form: { csrfToken, email, password: "AR-Prueba-2026", orgSlug: "ambar-rojo", json: "true", callbackUrl: base + "/cobros" } });
  const sesion = await (await context.request.get("/api/auth/session")).json();
  assert.equal(sesion.user.orgId, "1");
}
async function verificar(ancho, vista) {
  const medida = await page.evaluate(() => ({ viewport: innerWidth, documento: document.documentElement.scrollWidth, contenido: document.querySelector("main")?.scrollWidth, anchoContenido: document.querySelector("main")?.clientWidth }));
  assert.ok(medida.documento <= ancho, `${vista} desborda a ${ancho}`);
  assert.ok(medida.contenido <= medida.anchoContenido, `${vista}: main desborda`);
  if (vista !== "cobros") {
    const modal = page.getByRole("dialog");
    await modal.evaluate(async el => { await Promise.all(el.getAnimations({ subtree: true }).map(animacion => animacion.finished)); });
    const caja = await modal.locator("form").boundingBox();
    assert.ok(caja.x >= 0 && caja.x + caja.width <= ancho, "formulario dentro del viewport");
    const botones = await modal.getByRole("button").all();
    for (const boton of botones) assert.ok((await boton.boundingBox()).height >= 44, "área táctil de 44px");
  }
  medidas.push({ vista, ancho, ...medida });
  await page.screenshot({ path: fileURLToPath(new URL(`${vista}-${ancho}.png`, import.meta.url)), fullPage: vista === "cobros" });
}
try {
  fixture = await tenant(async tx => {
    const contacto = await tx.contacto.create({ data: { nombre: "Cliente de pruebas con nombre extenso para revisión de cobros" } });
    const contrato = await tx.contrato.create({ data: { contactoId: contacto.id, tipo: "web", estado: "produccion" } });
    const pagado = await tx.cobro.create({ data: { contratoId: contrato.id, concepto: "extra", monto: "1234.56", montoPagado: "1234.56", estado: "pagado", pagadoEn: new Date(), metodo: "transferencia", pagos: [{ clave: "captura-pago", monto: "1234.56", pagadoEn: new Date().toISOString(), metodo: "transferencia", referencia: "Pago por error" }] } });
    const cancelado = await tx.cobro.create({ data: { contratoId: contrato.id, concepto: "balance", monto: "800", estado: "cancelado", nota: "Cancelado para pruebas" } });
    const mensual = await tx.cobro.create({ data: { contratoId: contrato.id, concepto: "mensualidad", periodo: new Date("2099-01-01T00:00:00Z"), monto: "500", estado: "cancelado", nota: "Conservar para no regenerar" } });
    const pendiente = await tx.cobro.create({ data: { contratoId: contrato.id, concepto: "extra", monto: "500", montoPagado: "100", estado: "pendiente" } });
    const modulo = await tx.moduloOrg.findUniqueOrThrow({ where: { orgId_clave: { orgId: 1n, clave: "cobros" } } });
    await tx.moduloOrg.update({ where: { id: modulo.id }, data: { config: { puestosPermitidos: ["Administrador", "Agente"] } } });
    const agente = await tx.usuario.create({ data: { nombre: "Agente visual", email: "agente@visual.local.test", passwordHash: await bcrypt.hash("AR-Prueba-2026", 10), rol: "agente", puesto: "Agente" } });
    return { contacto, contrato, pagado, cancelado, mensual, pendiente, modulo, agente };
  });
  await login(contexto, "admin@ambar-rojo.local.test");
  const destino = `/cobros?contratoId=${fixture.contrato.id}`;
  for (const ancho of [375, 1440]) {
    await page.setViewportSize({ width: ancho, height: ancho === 375 ? 900 : 1000 });
    await page.goto(destino, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Cobros y fechas de pago" }).waitFor();
    const pagado = page.locator(`[data-cobro-id="${fixture.pagado.id}"]`);
    const cancelado = page.locator(`[data-cobro-id="${fixture.cancelado.id}"]`);
    const mensual = page.locator(`[data-cobro-id="${fixture.mensual.id}"]`);
    assert.equal(await mensual.getByRole("button", { name: "Eliminar", exact: true }).count(), 0);
    await verificar(ancho, "cobros");
    await pagado.getByRole("button", { name: "Cancelar", exact: true }).click();
    const modal = page.getByRole("dialog", { name: "Cancelar cobro", exact: true });
    await modal.waitFor();
    assert.equal(await modal.getByRole("button", { name: "Confirmar cancelación" }).isDisabled(), true);
    await modal.getByRole("textbox", { name: "Motivo (obligatorio)" }).fill("Pago registrado por error; revisión visual local");
    assert.equal(await modal.getByRole("button", { name: "Confirmar cancelación" }).isEnabled(), true);
    await verificar(ancho, "cancelar");
    await modal.getByRole("button", { name: "Volver" }).click();
    await cancelado.getByRole("button", { name: "Eliminar", exact: true }).click();
    const eliminacion = page.getByRole("dialog", { name: "Eliminar cobro", exact: true });
    await eliminacion.waitFor();
    assert.match(await eliminacion.innerText(), /Cliente de pruebas.*balance.*\$800\.00 MXN/s);
    await verificar(ancho, "eliminar");
    await eliminacion.getByRole("button", { name: "Volver" }).click();
    await mensual.scrollIntoViewIfNeeded();
    await page.locator("main").evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.screenshot({ path: fileURLToPath(new URL(`cobros-historial-${ancho}.png`, import.meta.url)), fullPage: true });
  }
  const agenteContexto = await browser.newContext({ baseURL: base, viewport: { width: 375, height: 900 } });
  try {
    await login(agenteContexto, "agente@visual.local.test");
    const agentePagina = await agenteContexto.newPage();
    await agentePagina.goto(destino, { waitUntil: "networkidle" });
    assert.equal(await agentePagina.getByRole("button", { name: /^(Cancelar|Eliminar)$/ }).count(), 0, "agente no ve acciones");
  } finally { await agenteContexto.close(); }
  // Ejercer las confirmaciones reales contra la API local.
  await page.locator(`[data-cobro-id="${fixture.pagado.id}"]`).getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("textbox", { name: "Motivo (obligatorio)" }).fill("Pago por error");
  const respuestaCancelar = page.waitForResponse(r => r.url().endsWith(`/api/cobros/${fixture.pagado.id}`) && r.request().method() === "PATCH");
  await page.getByRole("button", { name: "Confirmar cancelación" }).click();
  assert.equal((await respuestaCancelar).status(), 200);
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.locator(`[data-cobro-id="${fixture.pagado.id}"]`).getByRole("button", { name: "Eliminar", exact: true }).waitFor();
  await page.locator(`[data-cobro-id="${fixture.cancelado.id}"]`).getByRole("button", { name: "Eliminar", exact: true }).click();
  const respuestaEliminar = page.waitForResponse(r => r.url().endsWith(`/api/cobros/${fixture.cancelado.id}`) && r.request().method() === "DELETE");
  await page.getByRole("button", { name: "Confirmar eliminación" }).click();
  assert.equal((await respuestaEliminar).status(), 204);
  await page.locator(`[data-cobro-id="${fixture.cancelado.id}"]`).waitFor({ state: "detached" });
  assert.deepEqual(errores, []);
  console.log(JSON.stringify({ medidas, errores, ui: "Confirmaciones reales PATCH 200 / DELETE 204; agente sin acciones; mensualidad sin Eliminar; sin desbordes; botones de confirmación >=44px" }, null, 2));
} finally {
  await writeFile(new URL("visual.json", import.meta.url), JSON.stringify({ medidas, errores }, null, 2));
  if (fixture) await tenant(async tx => {
    await tx.cobro.deleteMany({ where: { contratoId: fixture.contrato.id } });
    await tx.contrato.delete({ where: { id: fixture.contrato.id } });
    await tx.contacto.delete({ where: { id: fixture.contacto.id } });
    await tx.usuario.delete({ where: { id: fixture.agente.id } });
    await tx.moduloOrg.update({ where: { id: fixture.modulo.id }, data: { config: fixture.modulo.config } });
  });
  await browser.close();
  await prisma.$disconnect();
}
