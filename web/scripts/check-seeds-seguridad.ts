import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const directorio = new URL("./", import.meta.url);
const seeds = (await readdir(directorio))
  .filter((archivo) => archivo.startsWith("seed-demo-") && archivo.endsWith(".mjs"));
assert.ok(seeds.length >= 7);
for (const seed of seeds) {
  const contenido = await readFile(new URL(seed, directorio), "utf8");
  assert.match(contenido, /credencialesDemo/);
  assert.match(contenido, /imprimirCredencialesDemo/);
}

const helper = await readFile(new URL("lib/demo-seed.mjs", directorio), "utf8");
assert.match(helper, /NODE_ENV === "production"/);
assert.match(helper, /ALLOW_DEMO_SEED !== "1"/);
assert.match(helper, /randomBytes/);

const documentacion = await readFile(new URL("../../MODULOS.md", import.meta.url), "utf8");
assert.doesNotMatch(documentacion, /(?:Auto|Inmo|Retail|Legal|Viajes|Academia)Demo\d{4}/);
assert.match(documentacion, /ALLOW_DEMO_SEED=1/);

console.log("seeds demo: bloqueo de producción, autorización y contraseña aleatoria OK");
