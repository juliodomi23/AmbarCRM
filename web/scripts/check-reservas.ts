import assert from "node:assert/strict";
import {
  calcularHorarios,
  diaSemana,
  fechaLocal,
  fechaValida,
  horaTexto,
  instanteLocal,
  minutosDeHora,
  sumarDias,
  ventanasDelDia,
} from "../src/lib/reservas/horarios.ts";
import {
  validarAjustesReservas,
  validarExcepcion,
  validarHorarioDoctor,
  validarServicioReserva,
} from "../src/lib/reservas/validar.ts";
import { telefonoMx } from "../src/lib/reservas/telefono.ts";

// Mismos casos que las pruebas de Cita en Click (slots.test.ts), con el motor portado.
const ZONA = "America/Mexico_City"; // UTC-6, sin horario de verano
const base = {
  fecha: "2026-08-05", // miércoles
  zona: ZONA,
  ocupados: [],
  duracionMin: 30,
  bufferMin: 5,
  granularidadMin: 15,
  anticipacionMin: 120,
  ahora: new Date("2026-08-01T12:00:00Z"),
};
const local = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
const manana = [{ inicioMin: 540, finMin: 840 }]; // 09:00–14:00

// Hora local del negocio, no del servidor: 09:00 en Tuxtla = 15:00 UTC.
const slots = calcularHorarios({ ...base, ventanas: manana });
assert.equal(slots[0], "2026-08-05T15:00:00.000Z");
// El último cabe completo con su buffer: 13:15 + 35 = 13:50; 13:30 + 35 se pasaría.
assert.equal(local(slots.at(-1)!), "13:15");

// Turno partido: dos bloques sin inventar el hueco.
const partido = calcularHorarios({ ...base, ventanas: [...manana, { inicioMin: 960, finMin: 1200 }] }).map(local);
assert.ok(partido.includes("13:15") && partido.includes("16:00"));
assert.ok(!partido.some((h) => h > "13:15" && h < "16:00"));

// Una cita bloquea los horarios que se traslapan (10:00–10:35 local).
const conCita = calcularHorarios({
  ...base, ventanas: manana, ocupados: [{ inicio: "2026-08-05T16:00:00Z", fin: "2026-08-05T16:35:00Z" }],
}).map(local);
for (const h of ["09:30", "09:45", "10:00", "10:15", "10:30"]) assert.ok(!conCita.includes(h), h);
assert.ok(conCita.includes("09:15") && conCita.includes("10:45"));

// Anticipación mínima: a las 10:00 locales con 2 h, lo primero es a las 12:00.
assert.equal(local(calcularHorarios({ ...base, ventanas: manana, ahora: new Date("2026-08-05T16:00:00Z") })[0]), "12:00");

// Día cerrado y zona del negocio.
assert.deepEqual(calcularHorarios({ ...base, ventanas: [] }), []);
assert.equal(calcularHorarios({ ...base, zona: "America/Cancun", ventanas: manana })[0], "2026-08-05T14:00:00.000Z");

// Horario de verano: Nueva York el día del cambio (8 de marzo de 2026).
assert.equal(instanteLocal("2026-03-08", 600, "America/New_York").toISOString(), "2026-03-08T14:00:00.000Z");
assert.equal(instanteLocal("2026-03-07", 600, "America/New_York").toISOString(), "2026-03-07T15:00:00.000Z");

// Excepciones mandan sobre la regla semanal.
assert.deepEqual(ventanasDelDia(manana, []), manana);
assert.deepEqual(ventanasDelDia(manana, [{ inicioMin: null, finMin: null }]), [], "día cerrado");
assert.deepEqual(ventanasDelDia(manana, [{ inicioMin: 600, finMin: 720 }]), [{ inicioMin: 600, finMin: 720 }]);

// Utilidades.
assert.equal(diaSemana("2026-08-05"), 3);
assert.equal(fechaLocal(new Date("2026-08-06T05:30:00Z"), ZONA), "2026-08-05", "noche en México, otro día en UTC");
assert.equal(sumarDias("2026-12-31", 1), "2027-01-01");
assert.equal(fechaValida("2026-02-30"), false);
assert.equal(fechaValida("2026-02-28"), true);
assert.equal(minutosDeHora("09:30"), 570);
assert.equal(minutosDeHora("24:00"), 1440);
assert.equal(minutosDeHora("25:00"), null);
assert.equal(horaTexto(570), "09:30");

// Validadores de la configuración.
assert.ok("error" in validarServicioReserva({ nombre: "Corte", duracionMin: "30", doctorIds: "" }), "requiere especialista");
assert.ok("error" in validarServicioReserva({ nombre: "Corte", duracionMin: "3", doctorIds: "1" }), "duración mínima 5");
assert.ok("error" in validarServicioReserva({ nombre: "Corte", duracionMin: "30", doctorIds: "1", precio: "1.005" }));
const servicio = validarServicioReserva({ nombre: "Corte", duracionMin: "30", doctorIds: "1,2,2", precio: "150" });
assert.ok("data" in servicio && servicio.doctorIds.length === 2, "sin especialistas repetidos");
assert.ok("error" in validarHorarioDoctor({ doctorId: "1", diaSemana: "1", inicio: "14:00", fin: "09:00" }));
assert.ok("error" in validarHorarioDoctor({ doctorId: "1", diaSemana: "7", inicio: "09:00", fin: "14:00" }));
const horario = validarHorarioDoctor({ doctorId: "1", diaSemana: "1", inicio: "09:00", fin: "14:00" });
assert.ok("data" in horario && horario.data.inicioMin === 540 && horario.data.finMin === 840);
const cerrado = validarExcepcion({ doctorId: "1", fecha: "2026-12-25" });
assert.ok("data" in cerrado && cerrado.data.inicioMin === null, "sin horas = cerrado");
assert.ok("error" in validarExcepcion({ doctorId: "1", fecha: "2026-12-25", inicio: "10:00" }), "horario especial incompleto");
assert.ok("error" in validarAjustesReservas({ anticipacionMin: "60", ventanaDias: "200", granularidadMin: "30", maxPorTelefono: "3" }));

// Teléfonos de México en la reserva pública.
assert.equal(telefonoMx("961 123 4567"), "9611234567");
assert.equal(telefonoMx("+52 1 961 123 4567"), "9611234567");
assert.equal(telefonoMx("529611234567"), "9611234567");
assert.equal(telefonoMx("12345"), null);

console.log("reservas: motor de horarios, zonas y excepciones OK");
