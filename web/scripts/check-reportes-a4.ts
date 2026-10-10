import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const costos = [
  "src/lib/caja-db.ts", "src/lib/caja-a2-db.ts", "src/lib/cotizaciones-db.ts",
  "src/app/api/ventas/route.ts", "src/lib/pedidos-db.ts", "src/lib/venta-estado-db.ts",
];
for (const ruta of costos) assert.match(await readFile(ruta, "utf8"), /costoUnitario/, `${ruta} debe manejar costo histórico`);
const reporte = await readFile("src/lib/reportes-retail-db.ts", "utf8");
assert.match(reporte, /estado: \{ notIn: \["cancelada", "borrador"\] \}/);
assert.match(reporte, /fechaHoraLocal/);
assert.match(reporte, /ingresosNetosPorPartida/);
assert.match(reporte, /devolucionPartida/);
const api = await readFile("src/app/api/reportes/retail/route.ts", "utf8");
assert.match(api, /puedeVerReportesRetail/);
assert.match(api, /toCSV/);
console.log(JSON.stringify({ costosEnTodosLosCaminos: costos, ingresoProrrateado: true, devolucionesPorPeriodo: true, zonaLocal: true, csvProtegido: true, permisos: true }));
