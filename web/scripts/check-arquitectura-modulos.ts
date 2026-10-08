import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const raizApi = new URL("../src/app/api/", import.meta.url);
const rutas = (await readdir(raizApi, { recursive: true }))
  .filter((ruta) => ruta.endsWith("route.ts"));
const rutasConModulo = [];
for (const ruta of rutas) {
  const contenido = await readFile(new URL(ruta.replaceAll("\\", "/"), raizApi), "utf8");
  if (contenido.includes("conModulo(")) rutasConModulo.push(ruta);
}
assert.equal(rutasConModulo.length, 33, "deben existir 33 rutas de módulos con conModulo (31 + sucursales y operación legal)");

// Cada módulo de listado debe permitir capturar desde la pantalla, no solo por API.
for (const pagina of [
  "tours", "reservas-tours", "pagos-tours", "alumnos", "cursos-academia", "inscripciones-academia",
  "colegiaturas", "asistencia-academia", "legal", "asesorias-legales", "finanzas-legales", "operacion-legal",
]) {
  const contenido = await readFile(`src/app/(app)/${pagina}/page.tsx`, "utf8");
  assert.match(contenido, /<FormularioModulo/, `${pagina} debe tener formulario de captura`);
}

const config = await readFile(
  new URL("../src/components/config/ConfiguracionCliente.tsx", import.meta.url),
  "utf8",
);
assert.ok(config.split(/\r?\n/).length < 180, "ConfiguracionCliente debe ser solo el orquestador");
const tabs = await readdir(new URL("../src/components/config/tabs/", import.meta.url));
assert.ok(tabs.filter((archivo) => archivo.endsWith(".tsx")).length >= 9);

const paginadas = [
  "citas/route.ts",
  "automotriz/vehiculos/route.ts",
  "clientes/route.ts",
  "doctores/route.ts",
  "compras/proveedores/route.ts",
  "inmobiliaria/propiedades/route.ts",
  "legal/expedientes/route.ts",
  "pacientes/route.ts",
  "productos/route.ts",
  "viajes/reservas/route.ts",
  "viajes/tours/route.ts",
  "mensajes/programados/route.ts",
];
for (const ruta of paginadas) {
  const contenido = await readFile(new URL(ruta, raizApi), "utf8");
  assert.match(contenido, /paginacionListado\(req\)/, `${ruta} debe tener límite o cursor`);
}

const modulosMd = await readFile(new URL("../../MODULOS.md", import.meta.url), "utf8");
for (const paso of ["catálogo", "schema.prisma", "conModulo", "componente", "seed", "check-*.ts", "aislamiento"]) {
  assert.ok(modulosMd.includes(paso), `falta ${paso} en el checklist de módulos`);
}

console.log("arquitectura: conModulo, pestañas, paginación y checklist OK");
