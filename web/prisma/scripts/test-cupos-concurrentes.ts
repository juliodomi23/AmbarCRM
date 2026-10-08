import assert from "node:assert/strict";
import { dbRaw } from "../../src/lib/db";
import {
  ErrorCupo,
  inscribirAlumnoConCupo,
  reservarTourConCupo,
} from "../../src/lib/cupos-db";
import { transaccionTenant } from "../../src/lib/retail-db";

const INTENTOS = 10;
const CAPACIDAD = 3;

async function crearEscenario() {
  const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const orgId = BigInt(Date.now());
  const org = await dbRaw.org.create({
    data: { id: orgId, nombre: "Prueba concurrencia", slug: `cupos-${sufijo}` },
  });
  return transaccionTenant(org.id, async (tx) => {
    const contactos = [];
    for (let indice = 0; indice < INTENTOS; indice += 1) {
      contactos.push(
        await tx.contacto.create({ data: { nombre: `Contacto ${indice + 1}` } }),
      );
    }
    const tour = await tx.tour.create({
      data: {
        clave: `TOUR-${sufijo}`,
        nombre: "Tour concurrente",
        destino: "México",
        capacidad: CAPACIDAD,
        precio: 100,
      },
    });
    const curso = await tx.cursoAcademia.create({
      data: {
        clave: `CURSO-${sufijo}`,
        nombre: "Curso concurrente",
        capacidad: CAPACIDAD,
      },
    });
    const alumnos = [];
    for (const [indice, contacto] of contactos.entries()) {
      alumnos.push(
        await tx.alumnoAcademia.create({
          data: { contactoId: contacto.id, matricula: `AL-${sufijo}-${indice}` },
        }),
      );
    }
    return { orgId: org.id, contactos, tour, curso, alumnos };
  });
}

async function comprobarRechazos(resultados: PromiseSettledResult<unknown>[]) {
  const aceptados = resultados.filter((resultado) => resultado.status === "fulfilled");
  const rechazados = resultados.filter((resultado) => resultado.status === "rejected");
  assert.equal(aceptados.length, CAPACIDAD, "debe aceptar exactamente la capacidad");
  assert.equal(rechazados.length, INTENTOS - CAPACIDAD, "debe rechazar el excedente");
  for (const rechazo of rechazados) {
    assert(rechazo.status === "rejected" && rechazo.reason instanceof ErrorCupo);
  }
}

async function main() {
  const escenario = await crearEscenario();
  const reservas = await Promise.allSettled(
    escenario.contactos.map((contacto, indice) =>
      reservarTourConCupo(escenario.orgId, {
        codigo: `PAR-${Date.now()}-${indice}`,
        tourId: escenario.tour.id,
        contactoId: contacto.id,
        viajeros: 1,
        total: 100,
        saldo: 100,
      }),
    ),
  );
  await comprobarRechazos(reservas);

  const inscripciones = await Promise.allSettled(
    escenario.alumnos.map((alumno) =>
      inscribirAlumnoConCupo(escenario.orgId, {
        alumnoId: alumno.id,
        cursoId: escenario.curso.id,
      }),
    ),
  );
  await comprobarRechazos(inscripciones);

  await transaccionTenant(escenario.orgId, async (tx) => {
    const ocupacion = await tx.reservaTour.aggregate({
      where: { tourId: escenario.tour.id },
      _sum: { viajeros: true },
    });
    const inscritos = await tx.inscripcionAcademia.count({
      where: { cursoId: escenario.curso.id, estado: "activa" },
    });
    assert.equal(ocupacion._sum.viajeros, CAPACIDAD);
    assert.equal(inscritos, CAPACIDAD);
  });
  console.log("OK · cupos concurrentes de tours y academia respetan la capacidad");
}

main()
  .then(() => dbRaw.$disconnect())
  .catch(async (error) => {
    console.error("FALLO:", error);
    await dbRaw.$disconnect();
    process.exit(1);
  });
