import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const base = process.env.E2E_BASE_URL;
assert.equal(base, "http://127.0.0.1:3129");
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const context = await browser.newContext({ baseURL: base, viewport: { width: 1440, height: 1000 }, timezoneId: "America/Mexico_City" });
const page = await context.newPage();
const errores = [];
const medidas = [];
const comprobaciones = [];
page.on("pageerror", e => { errores.push(e.message); console.error(JSON.stringify({ ruta: page.url(), error: e.message, stack: e.stack })); });
page.on("console", mensaje => { if (mensaje.type() === "error") console.error("Consola:", page.url(), mensaje.text()); });
const guardar = nombre => page.screenshot({ path: fileURLToPath(new URL(nombre, import.meta.url)), fullPage: true, animations: "disabled" });
async function medir(ruta, ancho) {
  const medida = await page.evaluate(() => {
    const main = document.querySelector("main");
    const dialogo = document.querySelector('[role="dialog"] > .surface');
    return { viewport: innerWidth, documento: document.documentElement.scrollWidth, contenido: main.scrollWidth, anchoContenido: main.clientWidth, dialogo: dialogo ? { ancho: dialogo.clientWidth, contenido: dialogo.scrollWidth } : null };
  });
  assert.equal(medida.documento, ancho, `${ruta}: ancho del documento`);
  assert.equal(medida.contenido, medida.anchoContenido, `${ruta}: sin desbordamiento del contenedor`);
  if (medida.dialogo) assert.equal(medida.dialogo.ancho, medida.dialogo.contenido, "Sin desbordamiento del formulario");
  medidas.push({ ruta, ancho, ...medida });
}
try {
  const csrfToken = (await (await context.request.get("/api/auth/csrf")).json()).csrfToken;
  await context.request.post("/api/auth/callback/credentials", { form: { csrfToken, email: "admin@ambar-rojo.local.test", password: "AR-Prueba-2026", orgSlug: "ambar-rojo", json: "true", callbackUrl: base + "/servidores" } });
  assert.equal((await (await context.request.get("/api/auth/session")).json()).user.orgId, "1");
  for (const ancho of [375, 1440]) {
    await page.setViewportSize({ width: ancho, height: ancho === 375 ? 900 : 1000 });
    await page.goto("/servidores", { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Servidores", exact: true }).waitFor();
    assert.equal(await page.locator("article[data-servidor-id]").count(), 4);
    await medir("/servidores", ancho);
    await guardar(`servidores-${ancho}.png`);
    for (let i = 0; i < 4; i++) {
      const tarjeta = page.locator("article[data-servidor-id]").nth(i);
      const notas = tarjeta.locator("details").filter({ has: page.locator("summary", { hasText: /^Notas$/ }) });
      assert.equal(await notas.getAttribute("open"), null, "Notas colapsadas");
      const confirmado = tarjeta.locator("summary", { hasText: "Datos por confirmar" });
      assert.ok(await confirmado.count() <= 1);
      const enlace = tarjeta.getByRole("heading", { level: 2 });
      await enlace.scrollIntoViewIfNeeded();
      await page.evaluate(el => {
        const main = document.querySelector("main");
        main.scrollTop += el.getBoundingClientRect().top - main.getBoundingClientRect().top - 12;
      }, await tarjeta.elementHandle());
      await guardar(`servidores-estado-${i + 1}-${ancho}.png`);
    }
    assert.equal(await page.getByText("RAM 91 %", { exact: true }).count(), 0, "Sin titular duplicado");
    assert.ok(await page.getByText("Un solo reporte; aún no hay tendencia.", { exact: true }).count());
    assert.ok(await page.getByText("Pocos reportes; cada punto es una lectura recibida. Valores estables.", { exact: true }).count());
    const carga = page.getByRole("link", { name: /Futura Fortuna/ });
    assert.ok(await carga.count());
    assert.equal(await carga.evaluate(el => getComputedStyle(el).color), await page.getByText("DeclaraBot", { exact: true }).evaluate(el => getComputedStyle(el).color));
    const primera = page.locator("article[data-servidor-id]").first();
    assert.notEqual(await primera.getByRole("button", { name: "Regenerar token", exact: true }).evaluate(el => getComputedStyle(el).color), await primera.getByRole("button", { name: "Editar", exact: true }).evaluate(el => getComputedStyle(el).color), "La acción destructiva debe usar un tono distinto de Editar");
    await primera.locator("footer").scrollIntoViewIfNeeded();
    await guardar(`servidores-cargas-${ancho}.png`);
    await primera.getByRole("button", { name: "Editar", exact: true }).click();
    const edicion = page.getByRole("dialog", { name: "Editar servidor", exact: true });
    assert.equal(await edicion.getByLabel("Nombre *", { exact: true }).inputValue(), "01 · VPS Operativo");
    await medir("/servidores · editar", ancho);
    await guardar(`servidor-editar-${ancho}.png`);
    await edicion.getByRole("button", { name: "Cancelar", exact: true }).click();
    const pendientes = page.locator("article[data-servidor-id]").last().getByText("Datos por confirmar", { exact: true });
    await pendientes.click();
    await guardar(`servidores-pendientes-${ancho}.png`);
    assert.ok(await page.getByText("Costo anual · RAM total · Fecha de vencimiento · Cargas", { exact: true }).isVisible());
    await pendientes.click();
    await page.locator("main").evaluate(el => { el.scrollTop = el.scrollHeight; });
    const espacio = await page.evaluate(() => {
      const ultimo = [...document.querySelectorAll('article footer button')].at(-1).getBoundingClientRect();
      const nav = document.querySelector("main + nav");
      return { acciones: ultimo.bottom, limite: getComputedStyle(nav).display === "none" ? innerHeight : nav.getBoundingClientRect().top };
    });
    assert.ok(espacio.acciones <= espacio.limite, `Barra inferior tapa acciones en ${ancho}`);
    await guardar(`servidores-final-${ancho}.png`);
    await page.getByRole("button", { name: "+ Nuevo servidor", exact: true }).click();
    const modal = page.getByRole("dialog", { name: "Nuevo servidor", exact: true });
    await modal.waitFor();
    await page.waitForTimeout(250);
    assert.ok(await modal.getByLabel("Nombre *", { exact: true }).evaluate(el => el === document.activeElement));
    await medir("/servidores · formulario", ancho);
    await guardar(`servidor-formulario-${ancho}.png`);
    await modal.getByRole("button", { name: "Guardar", exact: true }).scrollIntoViewIfNeeded();
    await guardar(`servidor-formulario-final-${ancho}.png`);
    await page.keyboard.press("Escape");
    const tarjeta = page.locator("article[data-servidor-id]").first();
    let regeneraciones = 0;
    const contar = request => { if (request.method() === "POST" && /\/api\/servidores\/\d+\/token$/.test(request.url())) regeneraciones++; };
    page.on("request", contar);
    await tarjeta.getByRole("button", { name: "Regenerar token", exact: true }).click();
    const confirmacion = page.getByRole("dialog", { name: "Regenerar token de heartbeat", exact: true });
    assert.ok(await confirmacion.getByText("01 · VPS Operativo", { exact: true }).isVisible());
    assert.ok(await confirmacion.getByRole("button", { name: "Cancelar", exact: true }).evaluate(el => el === document.activeElement));
    assert.equal(regeneraciones, 0, "Abrir confirmación no invalida tokens");
    await guardar(`regenerar-confirmacion-${ancho}.png`);
    await confirmacion.getByRole("button", { name: "Cancelar", exact: true }).click();
    assert.equal(regeneraciones, 0, "Cancelar no regenera");
    page.off("request", contar);
    await page.goto("/panel-ar", { waitUntil: "networkidle" });
    const alertas = page.getByRole("region", { name: "Alertas de la plataforma" });
    await alertas.waitFor();
    await medir("/panel-ar", ancho);
    const enlaces = await alertas.locator("li a").evaluateAll(els => els.map(el => ({ href: el.getAttribute("href"), texto: el.textContent })));
    assert.ok(enlaces.length >= 4);
    assert.ok(enlaces.every(e => e.href === "/servidores"));
    const niveles = enlaces.map(e => e.texto.includes("Crítica") ? "rojo" : "amarillo");
    assert.equal(niveles.lastIndexOf("rojo") < niveles.indexOf("amarillo"), true, "Críticas primero");
    await guardar(`panel-ar-${ancho}.png`);
    await alertas.scrollIntoViewIfNeeded();
    await guardar(`panel-ar-alertas-${ancho}.png`);
    comprobaciones.push({ ancho, estados: "verde, amarillo, rojo y gris", notas: "colapsadas", pendientes: "un indicador desplegable", cargas: "mismo color y baja como chip", historial: "24 puntos, 2 planos, 1 punto y vacío", acciones: espacio, confirmacion: "nombre del servidor, cancelar enfocado, cero POST al abrir/cancelar", alertas: niveles });
  }
  assert.deepEqual(errores, []);
  const salida = { fixtures: "Datos ficticios exclusivos de PostgreSQL local 127.0.0.1:55454/crm_pulido; no representan producción", medidas, comprobaciones, errores };
  await writeFile(new URL("visual.json", import.meta.url), JSON.stringify(salida, null, 2));
  console.log(JSON.stringify(salida, null, 2));
} finally { await browser.close(); }
