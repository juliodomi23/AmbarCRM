import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

const sw = (await readFile("public/sw.js", "utf8")).replaceAll("\r\n", "\n");

// 1) El bloque de notificaciones push de antes de A5 sigue byte por byte igual.
const MARCA = "\n// ─── Caja sin internet (A5)";
assert.ok(sw.includes(MARCA), "falta la sección de caja sin internet");
const original = sw.split(MARCA)[0];
assert.equal(createHash("sha1").update(original).digest("hex"), "7a52fb3649c3a052357e0ff5d41d3aec89779953", "los listeners push/notificationclick cambiaron");
assert.match(original, /addEventListener\("push"/);
assert.match(original, /showNotification\(/);
assert.match(original, /addEventListener\("notificationclick"/);
assert.match(original, /clients\.openWindow\(/);

// 2) Cachés de la caja versionados y limpiados en activate.
assert.match(sw, /ambar-caja-shell-\$\{VERSION\}/);
assert.match(sw, /ambar-caja-static-\$\{VERSION\}/);
assert.match(sw, /addEventListener\("activate"/);
assert.match(sw, /nombre\.startsWith\("ambar-caja-"\) && !CACHES_ACTUALES\.includes\(nombre\)/);
assert.match(sw, /caches\.delete\(nombre\)/);
assert.match(sw, /searchParams\.get\("v"\)/);

// 3) Solo se interceptan GET de /caja (navegación) y /_next/static; ninguna API.
const zonaFetch = sw.slice(sw.indexOf('addEventListener("fetch"'));
assert.doesNotMatch(zonaFetch, /\/api\//);
assert.match(zonaFetch, /request\.method !== "GET"/);
assert.match(zonaFetch, /url\.pathname === "\/caja"/);
assert.match(zonaFetch, /startsWith\("\/_next\/static\/"\)/);

// 4) Un solo registro de service worker, y con la versión del build.
const archivos = (await readdir("src", { recursive: true })).filter((ruta) => /\.(ts|tsx)$/.test(ruta));
const registros: string[] = [];
for (const ruta of archivos) {
  if ((await readFile(`src/${ruta}`, "utf8")).includes("serviceWorker.register(")) registros.push(ruta.replaceAll("\\", "/"));
}
assert.deepEqual(registros, ["components/PushSetup.tsx"]);
assert.match(await readFile("src/components/PushSetup.tsx", "utf8"), /register\(`\/sw\.js\?v=\$\{process\.env\.NEXT_PUBLIC_BUILD_ID/);
assert.match(await readFile("next.config.mjs", "utf8"), /NEXT_PUBLIC_BUILD_ID/);

console.log("sw: push y notificationclick intactos, cachés versionados con limpieza en activate, un solo registro");
