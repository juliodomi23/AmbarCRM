import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const baseURL = process.env.E2E_BASE_URL;
assert.equal(baseURL, "http://127.0.0.1:3129");
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 }, timezoneId: "America/Mexico_City" });
const page = await context.newPage();
const errores = [];
const resultados = [];
page.on("pageerror", e => errores.push(e.message));
try {
  const csrfToken = (await (await context.request.get("/api/auth/csrf")).json()).csrfToken;
  await context.request.post("/api/auth/callback/credentials", { form: { csrfToken, email: "admin@ambar-rojo.local.test", password: "AR-Prueba-2026", orgSlug: "ambar-rojo", json: "true", callbackUrl: baseURL + "/servidores" } });
  assert.equal((await (await context.request.get("/api/auth/session")).json()).user.orgId, "1");
  for (const ancho of [375, 1440]) {
    await page.setViewportSize({ width: ancho, height: ancho === 375 ? 900 : 1000 });
    await page.goto("/servidores", { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Servidores", exact: true }).waitFor();
    const primero = page.getByRole("region", { name: "Historial de recursos", exact: true }).first();
    if (ancho === 375) await primero.evaluate(el => {
      const main = document.querySelector("main");
      main.scrollTop += el.getBoundingClientRect().top - main.getBoundingClientRect().top - 200;
    });
    const medida = await page.evaluate(() => {
      const main = document.querySelector("main");
      const graficas = [...document.querySelectorAll('svg[role="img"][aria-label^="Uso de RAM"]')];
      return {
        viewport: innerWidth, documento: document.documentElement.scrollWidth, main: { ancho: main.clientWidth, contenido: main.scrollWidth },
        graficas: graficas.map(svg => {
          const v = svg.viewBox.baseVal;
          const r = svg.getBoundingClientRect();
          return { viewBox: { x: v.x, y: v.y, ancho: v.width, alto: v.height }, rect: { izquierda: r.left, derecha: r.right, arriba: r.top, abajo: r.bottom }, etiquetas: [...svg.querySelectorAll("text")].map(t => { const b = t.getBBox(); return { texto: t.textContent, x: b.x, ancho: b.width, completa: b.x >= v.x && b.x + b.width <= v.x + v.width }; }) };
        }),
      };
    });
    assert.equal(medida.documento, ancho);
    assert.equal(medida.main.ancho, medida.main.contenido);
    assert.equal(medida.graficas.length, 3);
    for (const g of medida.graficas) {
      assert.deepEqual(g.etiquetas.map(e => e.texto), ["0 %", "50 %", "100 %"]);
      assert.ok(g.etiquetas.every(e => e.completa), "Todas las etiquetas deben quedar dentro del SVG");
    }
    const graficaVisible = medida.graficas[0].rect;
    assert.ok(graficaVisible.arriba >= 64 && graficaVisible.abajo <= (ancho === 375 ? 843 : 1000), "Historial completo visible en la captura");
    const archivo = `servidores-historial-${ancho}.png`;
    await page.screenshot({ path: fileURLToPath(new URL(archivo, import.meta.url)), fullPage: false, animations: "disabled" });
    resultados.push({ ancho, archivo, ...medida });
  }
  assert.deepEqual(errores, []);
  const salida = { fixtures: "Datos ficticios solo en 127.0.0.1:55454/crm_pulido; no representan producción", resultados, errores };
  await writeFile(new URL("historial-visual.json", import.meta.url), JSON.stringify(salida, null, 2));
  console.log(JSON.stringify(salida, null, 2));
} finally { await browser.close(); }
