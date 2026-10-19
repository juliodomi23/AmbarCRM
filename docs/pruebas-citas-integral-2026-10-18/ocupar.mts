import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dbRaw } from "../../web/src/lib/db";
import { crearCitaInterna } from "../../web/src/lib/citas-servidor";
import { instanteLocal } from "../../web/src/lib/reservas/horarios";
assert.equal(new URL(process.env.DATABASE_URL!).port, "55450");
const fixture = JSON.parse(await readFile("../docs/pruebas-citas-integral-2026-10-18/visual.json", "utf8"));
const minutos = Number(process.argv[2] ?? 360);
assert.ok(Number.isInteger(minutos) && minutos >= 0 && minutos < 1440);
try {
  const org = await dbRaw.org.findUniqueOrThrow({ where: { slug: fixture.slug } });
  await crearCitaInterna(org.id, { titulo: "Horario tomado durante la reserva", contactoId: BigInt(fixture.contactoId), doctorId: BigInt(fixture.especialistaId), servicioId: BigInt(fixture.servicioId), inicio: instanteLocal(fixture.fecha, minutos, fixture.zona), notas: null, responsableId: null, conversacionId: null });
  console.log(`Horario ${minutos} minutos del fixture ocupado para verificar el conflicto público`);
} finally { await dbRaw.$disconnect(); }
