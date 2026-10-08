import assert from "node:assert/strict";
import { db, dbRaw, runWithOrg } from "../../src/lib/db";
import { referenciaAjena, referenciaPropia } from "../../src/lib/referencias";
import { citasPorRecordar } from "../../src/lib/recordatorios";

// Las llaves foráneas no respetan RLS: la app debe rechazar ids de otra empresa.
// Y el cron de recordatorios no debe atascarse con citas viejas sin recordatorio.

async function crearOrg(nombre: string) {
  const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return dbRaw.org.create({
    data: { id: BigInt(Date.now()) + BigInt(Math.floor(Math.random() * 1000)), nombre, slug: `ref-${sufijo}` },
  });
}

async function main() {
  const orgA = await crearOrg("Referencias A");
  const orgB = await crearOrg("Referencias B");

  const contactoA = await runWithOrg(orgA.id, () =>
    db.contacto.create({ data: { nombre: "Contacto de A", telefono: "5215550001" } }),
  );
  const contactoB = await runWithOrg(orgB.id, () =>
    db.contacto.create({ data: { nombre: "Contacto de B", telefono: "5215550002" } }),
  );

  await runWithOrg(orgB.id, async () => {
    assert.equal(await referenciaPropia("contacto", contactoB.id), contactoB.id);
    assert.equal(await referenciaPropia("contacto", contactoA.id), false, "B no puede usar un contacto de A");
    assert.equal(await referenciaPropia("contacto", "abc"), false);
    assert.equal(await referenciaPropia("contacto", ""), null);
    assert.equal(
      await referenciaAjena({ contactoId: contactoB.id, responsableId: 999999999 }, {
        contactoId: "contacto",
        responsableId: "usuario",
      }),
      "responsableId",
    );
    assert.equal(await referenciaAjena({ contactoId: contactoB.id }, { contactoId: "contacto" }), null);
  });

  // 150 citas pasadas sin recordatorio (nunca se marcan) + 1 futura dentro de la ventana.
  const ahora = new Date();
  const hora = 3_600_000;
  const futura = await runWithOrg(orgA.id, async () => {
    await db.cita.createMany({
      data: Array.from({ length: 150 }, (_, indice) => ({
        contactoId: contactoA.id,
        titulo: `Pasada ${indice}`,
        inicio: new Date(ahora.getTime() - (indice + 2) * hora),
        fin: new Date(ahora.getTime() - (indice + 1) * hora),
      })),
    });
    await db.cita.create({
      data: {
        contactoId: contactoA.id,
        titulo: "Fuera de la ventana",
        inicio: new Date(ahora.getTime() + 48 * hora),
        fin: new Date(ahora.getTime() + 49 * hora),
      },
    });
    return db.cita.create({
      data: {
        contactoId: contactoA.id,
        titulo: "Mañana",
        inicio: new Date(ahora.getTime() + 20 * hora),
        fin: new Date(ahora.getTime() + 21 * hora),
      },
    });
  });

  const pendientes = await runWithOrg(orgA.id, () => citasPorRecordar(24, ahora));
  assert.deepEqual(
    pendientes.map((cita) => cita.id),
    [futura.id],
    "solo la cita futura dentro de 24 h, aunque haya 150 pasadas sin recordatorio",
  );
  const deOtraEmpresa = await runWithOrg(orgB.id, () => citasPorRecordar(24, ahora));
  assert.equal(deOtraEmpresa.length, 0, "B no ve las citas de A");

  console.log("OK · referencias de otra empresa rechazadas y recordatorios sin atascos");
}

main()
  .then(() => dbRaw.$disconnect())
  .catch(async (error) => {
    console.error("FALLO:", error);
    await dbRaw.$disconnect();
    process.exit(1);
  });
