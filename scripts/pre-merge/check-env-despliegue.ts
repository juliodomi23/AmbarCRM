import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const raiz = path.resolve(path.dirname(process.argv[1]), "../..");
const web = path.join(raiz, "web");
const requerirDesdeWeb = createRequire(path.join(web, "package.json"));
const ts = requerirDesdeWeb("typescript") as typeof import("../../web/node_modules/typescript");
const argumento = process.argv.indexOf("--compose");
const archivoCompose = argumento < 0 ? path.join(raiz, "docker-compose.yml") : process.argv[argumento + 1];
if (!archivoCompose) throw new Error("Falta la ruta después de --compose");

function archivos(directorio: string): string[] {
  return readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(directorio, entrada.name);
    return entrada.isDirectory() ? archivos(ruta) : /\.[cm]?[jt]sx?$/.test(entrada.name) ? [ruta] : [];
  });
}

const usos = new Map<string, Set<string>>();
for (const archivo of [...archivos(path.join(web, "src")), path.join(web, "next.config.mjs")]) {
  const fuente = ts.createSourceFile(archivo, readFileSync(archivo, "utf8"), ts.ScriptTarget.Latest, true);
  function visitar(nodo: import("../../web/node_modules/typescript").Node) {
    if (ts.isPropertyAccessExpression(nodo) && ts.isPropertyAccessExpression(nodo.expression)
      && nodo.expression.expression.getText(fuente) === "process" && nodo.expression.name.text === "env") {
      const nombre = nodo.name.text;
      const rutas = usos.get(nombre) ?? new Set<string>();
      rutas.add(path.relative(raiz, archivo).replaceAll("\\", "/"));
      usos.set(nombre, rutas);
    }
    ts.forEachChild(nodo, visitar);
  }
  visitar(fuente);
}

const lineas = readFileSync(archivoCompose, "utf8").split(/\r?\n/);
const inicio = lineas.findIndex((linea) => /^  app:\s*$/.test(linea));
if (inicio < 0) throw new Error("Compose no contiene el servicio app");
const mapeadas = new Map<string, string>();
let seccion: "runtime" | "build" | undefined;
for (const linea of lineas.slice(inicio + 1)) {
  if (/^  [\w-]+:|^volumes:/.test(linea)) break;
  if (/^    environment:\s*$/.test(linea)) { seccion = "runtime"; continue; }
  if (/^      args:\s*$/.test(linea)) { seccion = "build"; continue; }
  if (/^    \S/.test(linea)) seccion = undefined;
  const coincidencia = linea.match(seccion === "build" ? /^        ([A-Z][A-Z0-9_]*):/ : /^      ([A-Z][A-Z0-9_]*):/);
  if (seccion && coincidencia) mapeadas.set(coincidencia[1], seccion);
}

const automaticas = new Map([
  ["NODE_ENV", "Next establece production en build/start"],
  ["NEXT_PUBLIC_BUILD_ID", "next.config.mjs lo genera e incorpora al build"],
]);
const opcionales = new Map([
  ["BUILD_ID", "next.config.mjs usa Date.now() si falta"],
  ["ANTHROPIC_MODEL", "el código define un modelo predeterminado"],
  ["BOT_RATE_LIMIT_MAX", "predeterminado: 300"],
  ["BOT_RATE_LIMIT_WINDOW_MS", "predeterminado: 60000"],
  ["BOT_AUTH_FAIL_MAX", "predeterminado: 20"],
  ["BOT_AUTH_FAIL_WINDOW_MS", "predeterminado: 300000"],
]);
const sinMapear = [...usos].filter(([nombre]) => !mapeadas.has(nombre) && !automaticas.has(nombre))
  .sort(([a], [b]) => a.localeCompare(b)).map(([nombre, rutas]) => ({
    nombre, obligatoria: !opcionales.has(nombre), motivo: opcionales.get(nombre) ?? "Requiere mapeo para llegar al contenedor", archivos: [...rutas].sort(),
  }));
const faltantesObligatorias = sinMapear.filter((variable) => variable.obligatoria).map((variable) => variable.nombre);
console.log(JSON.stringify({
  alcance: "web/src y next.config.mjs; solo nombres, sin leer .env ni consultar servicios",
  variablesUsadas: usos.size,
  metaEsperadas: Object.fromEntries(["META_APP_ID", "META_APP_SECRET"].map((nombre) => [nombre, mapeadas.get(nombre) ?? "FALTA"])),
  faltantesObligatorias, sinMapear, automaticas: Object.fromEntries(automaticas),
  limite: "Un mapeo no demuestra que el panel tenga un valor. Seeds y pruebas no forman parte del proceso desplegado.",
}, null, 2));
if (faltantesObligatorias.length) process.exitCode = 1;
