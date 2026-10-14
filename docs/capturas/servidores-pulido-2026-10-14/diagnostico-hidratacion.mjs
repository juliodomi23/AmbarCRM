import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE);
const browser = await chromium.launch({ headless: true, channel: "msedge" });
const resultados = [];
try {
  for (const baseURL of ["http://127.0.0.1:3130", "http://127.0.0.1:3129"]) {
    const contexto = await browser.newContext({ baseURL, viewport: { width: 375, height: 900 }, timezoneId: "America/Mexico_City" });
    const page = await contexto.newPage();
    const errores = [];
    page.on("console", m => { if (m.type() === "error") errores.push({ ruta: page.url(), tipo: "console", mensaje: m.text() }); });
    page.on("pageerror", e => errores.push({ ruta: page.url(), tipo: "pageerror", mensaje: e.message, stack: e.stack }));
    const csrfToken = (await (await contexto.request.get("/api/auth/csrf")).json()).csrfToken;
    await contexto.request.post("/api/auth/callback/credentials", { form: { csrfToken, email: "admin@ambar-rojo.local.test", password: "AR-Prueba-2026", orgSlug: "ambar-rojo", json: "true", callbackUrl: baseURL + "/servidores" } });
    for (let pasada = 0; pasada < 10; pasada++) {
      for (const ruta of ["/servidores", "/panel-ar"]) {
        await page.goto(ruta, { waitUntil: "networkidle" });
        if (ruta === "/servidores") {
          await page.getByRole("button", { name: "Editar", exact: true }).first().click();
          await page.getByRole("dialog", { name: "Editar servidor", exact: true }).waitFor();
          await page.keyboard.press("Escape");
        }
      }
    }
    resultados.push({ baseURL, navegaciones: 20, ediciones: 10, errores });
    await contexto.close();
  }
  console.log(JSON.stringify(resultados, null, 2));
  await writeFile(new URL("diagnostico-hidratacion.json", import.meta.url), JSON.stringify(resultados, null, 2));
  assert.ok(resultados.every(r => r.errores.length === 0));
} finally { await browser.close(); }
