import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  validarAlumno,
  validarAsistencia,
  validarColegiatura,
  validarCurso,
  validarInscripcion,
} from "../src/lib/academia.ts";
import { validarPagoTour, validarReservaTour, validarTour } from "../src/lib/viajes.ts";

const catalogo = await readFile(new URL("../src/lib/modulos.ts", import.meta.url), "utf8");
const sql = await readFile(new URL("../prisma/sql/actualizaciones.sql", import.meta.url), "utf8");
const cuposDb = await readFile(new URL("../src/lib/cupos-db.ts", import.meta.url), "utf8");

for (const clave of [
  "tours",
  "reservas_tours",
  "pagos_tours",
  "alumnos",
  "cursos_academia",
  "inscripciones_academia",
  "colegiaturas",
  "asistencia_academia",
]) {
  assert.match(catalogo, new RegExp(`clave: "${clave}"`));
}
for (const tabla of [
  "tours",
  "itinerarios_tour",
  "reservas_tour",
  "pagos_tour",
  "alumnos_academia",
  "cursos_academia",
  "inscripciones_academia",
  "colegiaturas_academia",
  "asistencias_academia",
]) {
  assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${tabla}`));
}
assert.ok("data" in validarTour({ nombre: "Oaxaca", destino: "Oaxaca", precio: 5000, capacidad: 20 }));
assert.ok("error" in validarTour({ nombre: "", destino: "Oaxaca", precio: -1, capacidad: 0 }));
assert.ok("data" in validarReservaTour({ tourId: 1, contactoId: 1, viajeros: 2, total: 10000 }));
assert.ok("data" in validarPagoTour({ reservaId: 1, monto: 2000 }));
assert.ok("data" in validarAlumno({ contactoId: 1, matricula: "A-01" }));
assert.ok("data" in validarCurso({ nombre: "Inglés", capacidad: 10, mensualidad: 1200 }));
assert.ok("data" in validarInscripcion({ alumnoId: 1, cursoId: 1 }));
assert.ok("data" in validarColegiatura({ alumnoId: 1, monto: 1200, vencimiento: "2026-10-10" }));
assert.ok("data" in validarAsistencia({ alumnoId: 1, cursoId: 1, fecha: "2026-10-07" }));
assert.match(cuposDb, /FROM tours[\s\S]*?FOR UPDATE/);
assert.match(cuposDb, /reservaTour\.aggregate/);
assert.match(cuposDb, /FROM cursos_academia[\s\S]*?FOR UPDATE/);
assert.match(cuposDb, /inscripcionAcademia\.count/);
assert.match(cuposDb, /FROM reservas_tour[\s\S]*?FOR UPDATE/);

console.log("viajes y academia: catálogo, reservas, cobros, alumnos, cursos y asistencia OK");
