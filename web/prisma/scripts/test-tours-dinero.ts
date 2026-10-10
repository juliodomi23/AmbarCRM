/**
 * Dinero de tours con Decimal: pagos parciales, liquidación exacta, cancelación de pago y edición del
 * total, sin tolerancias de punto flotante.
 *
 * ADMIN_DATABASE_URL=<dueño> DATABASE_URL=<crm_app> npx tsx prisma/scripts/test-tours-dinero.ts
 * Solo contra una BD desechable.
 */
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { dbRaw } from "../../src/lib/db";
import { ErrorCupo, registrarPagoTourConSaldo } from "../../src/lib/cupos-db";
import { actualizarReserva, cancelarPagoTour } from "../../src/lib/ediciones-db";
import { transaccionTenant } from "../../src/lib/retail-db";

const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const dec = (valor: string) => new Prisma.Decimal(valor);

async function main() {
  const org = await dbRaw.org.create({ data: { id: BigInt(Date.now()), nombre: "Dinero tours", slug: `dinero-tours-${sufijo}` } });
  const { reserva } = await transaccionTenant(org.id, async (tx) => {
    const contacto = await tx.contacto.create({ data: { nombre: "Viajero" } });
    const tour = await tx.tour.create({ data: { clave: `T-${sufijo}`, nombre: "Tour", destino: "MX", capacidad: 10, precio: 100.1 } });
    const reserva = await tx.reservaTour.create({
      data: { codigo: `R-${sufijo}`, tourId: tour.id, contactoId: contacto.id, viajeros: 1, estado: "confirmada", total: dec("100.10"), saldo: dec("100.10") },
    });
    return { reserva };
  });
  const estado = () => transaccionTenant(org.id, (tx) => tx.reservaTour.findUniqueOrThrow({ where: { id: reserva.id } }));
  const pagar = (monto: string) => registrarPagoTourConSaldo(org.id, { reservaId: reserva.id, concepto: "Pago", monto });

  // 33.37 sobre 100.10 → 66.73; pagar exactamente el resto liquida en 0.00 y no se rechaza.
  const primero = await pagar("33.37");
  assert.equal((await estado()).saldo.toFixed(2), "66.73");
  await pagar("66.73");
  const liquidada = await estado();
  assert.equal(liquidada.saldo.toFixed(2), "0.00");
  assert.equal(liquidada.estado, "liquidada");

  // Un centavo de más se rechaza con 400.
  await assert.rejects(pagar("0.01"), (e) => e instanceof ErrorCupo && e.status === 400);

  // Cancelar el primer pago devuelve exactamente 33.37 al saldo y deja de estar liquidada.
  await cancelarPagoTour(org.id, primero.id);
  const trasCancelar = await estado();
  assert.equal(trasCancelar.saldo.toFixed(2), "33.37");
  assert.equal(trasCancelar.estado, "confirmada");

  // El total no puede quedar por debajo de lo pagado (66.73): 66.72 se rechaza, 66.73 liquida en 0.00.
  await assert.rejects(actualizarReserva(org.id, reserva.id, { total: 66.72 }), (e) => e instanceof ErrorCupo && e.status === 400);
  assert.equal((await estado()).total.toFixed(2), "100.10", "el rechazo no cambia nada");
  await actualizarReserva(org.id, reserva.id, { total: 66.73 });
  const final = await estado();
  assert.equal(final.saldo.toFixed(2), "0.00");
  assert.equal(final.total.toFixed(2), "66.73");
  assert.equal(final.estado, "liquidada");

  // Varios pagos de centavos que en punto flotante no suman exacto (0.1 + 0.2) cierran en 0.00.
  const { reserva: r2 } = await transaccionTenant(org.id, async (tx) => ({
    reserva: await tx.reservaTour.create({
      data: { codigo: `R2-${sufijo}`, tourId: reserva.tourId, contactoId: reserva.contactoId, viajeros: 1, estado: "confirmada", total: dec("0.30"), saldo: dec("0.30") },
    }),
  }));
  await registrarPagoTourConSaldo(org.id, { reservaId: r2.id, concepto: "a", monto: "0.10" });
  await registrarPagoTourConSaldo(org.id, { reservaId: r2.id, concepto: "b", monto: "0.20" });
  const r2f = await transaccionTenant(org.id, (tx) => tx.reservaTour.findUniqueOrThrow({ where: { id: r2.id } }));
  assert.equal(r2f.saldo.toFixed(2), "0.00");
  assert.equal(r2f.estado, "liquidada");
  console.log("OK · dinero de tours: 100.10 − 33.37 = 66.73; el resto liquida en 0.00; 0.10 + 0.20 sobre 0.30 liquida");
}

main()
  .catch((e) => {
    console.error("FALLO:", e);
    process.exitCode = 1;
  })
  .finally(() => dbRaw.$disconnect());
