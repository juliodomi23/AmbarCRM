import assert from "node:assert/strict";
import { db, dbRaw, runWithOrg } from "../../src/lib/db";
import { calcularHorarios, fechaLocal, instanteLocal, sumarDias } from "../../src/lib/reservas/horarios";
import { configReservas, horariosDeDoctor, reservarCita } from "../../src/lib/reservas/servidor";

// Diez personas confirman el mismo horario al mismo tiempo: el bloqueo del especialista
// debe dejar pasar solo una cita por especialista libre.
const INTENTOS = 10;

async function main() {
  const cfg = configReservas({ anticipacionMin: 0 });
  const org = await dbRaw.org.create({
    data: { id: BigInt(Date.now()), nombre: "Prueba reservas", slug: `reservas-${Date.now()}` },
  });
  const manana = sumarDias(fechaLocal(new Date(), cfg.zona), 1);
  const inicio = instanteLocal(manana, 600, cfg.zona); // 10:00 local

  const escenario = await runWithOrg(org.id, async () => {
    const doctores = await Promise.all(["Especialista A", "Especialista B"].map((nombre) => db.doctor.create({ data: { nombre } })));
    const servicio = await db.servicioReserva.create({ data: { nombre: "Corte", duracionMin: 30, bufferMin: 10 } });
    for (const doctor of doctores) {
      await db.servicioReservaDoctor.create({ data: { servicioId: servicio.id, doctorId: doctor.id } });
      for (let dia = 0; dia < 7; dia++) {
        await db.horarioDoctor.create({ data: { doctorId: doctor.id, diaSemana: dia, inicioMin: 540, finMin: 840 } });
      }
    }
    const contactos = await Promise.all(
      Array.from({ length: INTENTOS }, (_, i) => db.contacto.create({ data: { nombre: `Cliente ${i}`, telefono: `52961000${String(i).padStart(4, "0")}` } })),
    );
    return { doctores, servicio, contactos };
  });

  // 1) Un solo especialista: diez intentos simultáneos, una cita.
  const unico = [escenario.doctores[0].id];
  const resultados = await Promise.all(
    escenario.contactos.map((contacto) =>
      reservarCita(org.id, { servicio: escenario.servicio, candidatos: unico, inicio, contactoId: contacto.id, notas: null }),
    ),
  );
  assert.equal(resultados.filter(Boolean).length, 1, "solo una persona obtiene el horario");

  // 2) Sin preferencia con dos especialistas: el otro horario libre se reparte, nunca tres.
  const inicio2 = instanteLocal(manana, 660, cfg.zona); // 11:00 local
  const ambos = escenario.doctores.map((d) => d.id);
  const repartidas = await Promise.all(
    escenario.contactos.map((contacto) =>
      reservarCita(org.id, { servicio: escenario.servicio, candidatos: ambos, inicio: inicio2, contactoId: contacto.id, notas: null }),
    ),
  );
  const creadas = repartidas.filter(Boolean);
  assert.equal(creadas.length, 2, "un lugar por especialista");
  assert.notEqual(String(creadas[0]!.doctorId), String(creadas[1]!.doctorId));

  // 3) La disponibilidad ya no ofrece lo ocupado (incluye el tiempo libre después de la cita).
  await runWithOrg(org.id, async () => {
    const libres = await horariosDeDoctor(cfg, escenario.servicio, escenario.doctores[0].id, manana);
    assert.ok(!libres.includes(inicio.toISOString()), "10:00 ya no aparece");
    const esperado = calcularHorarios({
      fecha: manana, zona: cfg.zona, ventanas: [{ inicioMin: 540, finMin: 840 }],
      ocupados: [{ inicio, fin: new Date(inicio.getTime() + 40 * 60_000) }, { inicio: inicio2, fin: new Date(inicio2.getTime() + 40 * 60_000) }],
      duracionMin: 30, bufferMin: 10, granularidadMin: cfg.granularidadMin, anticipacionMin: 0,
    });
    assert.deepEqual(libres, esperado);
    // Cancelar libera el horario.
    await db.cita.updateMany({ where: { doctorId: escenario.doctores[0].id, inicio }, data: { estado: "cancelada" } });
    assert.ok((await horariosDeDoctor(cfg, escenario.servicio, escenario.doctores[0].id, manana)).includes(inicio.toISOString()));
  });

  console.log("OK · reservas en línea simultáneas: un lugar por especialista, sin duplicados");
}

main()
  .then(() => dbRaw.$disconnect())
  .catch(async (error) => {
    console.error("FALLO:", error);
    await dbRaw.$disconnect();
    process.exit(1);
  });
