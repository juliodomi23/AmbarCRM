// Requiere playwright-core instalado FUERA del proyecto (p. ej. npm i playwright-core en /tmp y NODE_PATH). Uso: BASE=http://localhost:3100 GIRO=retail RUTAS="/,/chat" node scripts/verificar-demo-red.mjs
// Recorre /demo y falla si sale alguna petición al servidor distinta del documento y los assets estáticos.
import { chromium } from "playwright-core";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const SALIDA = process.env.SALIDA ?? "./capturas";
fs.mkdirSync(SALIDA, { recursive: true });
const rutas = (process.env.RUTAS ?? "/,/chat").split(",");
const acciones = process.env.ACCIONES ?? "";

const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const permitido = (u) => {
  const x = new URL(u);
  if (x.origin !== new URL(BASE).origin) return x.protocol === "data:" || x.protocol === "blob:";
  return x.pathname === "/demo" && !x.searchParams.has("_rsc") || x.pathname.startsWith("/_next/static/") || ["/manifest.json", "/icon.png", "/favicon.ico", "/apple-icon.png"].includes(x.pathname);
};
let fallos = 0;
for (const [ancho, alto] of [[1280, 800], [375, 812]]) {
  for (const tema of ["light", "dark"]) {
    const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto }, colorScheme: tema });
    const pagina = await ctx.newPage();
    const peticiones = [];
    pagina.on("request", (r) => peticiones.push(`${r.method()} ${r.url()}`));
    pagina.on("pageerror", (e) => console.log("pageerror", e.message));
    pagina.on("console", (m) => { if (m.type() === "error") console.log("console.error", m.text().slice(0, 200)); });
    await pagina.goto(`${BASE}/demo`, { waitUntil: "networkidle" });
    await pagina.waitForSelector("[data-demo-raiz]");
    if (process.env.GIRO) { await pagina.selectOption('select[aria-label="Giro del negocio"]', process.env.GIRO); await pagina.waitForTimeout(500); }
    for (const ruta of rutas) {
      await pagina.evaluate((r) => { history.pushState(null, "", "/demo#" + r); window.dispatchEvent(new Event("demo-navegacion")); }, ruta);
      await pagina.waitForTimeout(700);
      await pagina.screenshot({ path: `${SALIDA}/demo-${ancho}-${tema}-${ruta.replace(/[\/?=]/g, "_") || "inicio"}.png` });
    }
    await pagina.waitForTimeout(500);
    const malas = peticiones.filter((p) => !permitido(p.split(" ")[1]));
    console.log(`${ancho}px ${tema}: ${peticiones.length} peticiones, ${malas.length} no permitidas`);
    for (const m of malas) console.log("  ✗", m);
    fallos += malas.length;
    await ctx.close();
  }
}
await navegador.close();
process.exit(fallos ? 1 : 0);
