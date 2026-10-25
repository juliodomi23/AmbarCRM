import assert from "node:assert/strict";
import pg from "pg";
import { db, dbRaw, runWithOrg } from "../../src/lib/db";
import {
  crearCheckoutVenta,
  procesarEventoPago,
  reembolsarPago,
} from "../../src/lib/pagos/servicio";

const appUrl = process.env.DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
for (const valor of [appUrl, adminUrl]) {
  if (!valor)
    throw new Error(
      "Define DATABASE_URL y ADMIN_DATABASE_URL para PostgreSQL aislado",
    );
  const url = new URL(valor);
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.pathname !== "/pagos_test"
  ) {
    throw new Error("La prueba solo admite localhost/pagos_test");
  }
}
process.env.PAGOS_PROVEEDOR = "mock";
process.env.PAGOS_MOCK_SECRET = "secreto-e2e-pagos";
process.env.PAGOS_BASE_URL = "http://localhost:3000";

const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
const orgA = 91n;
const orgB = 92n;

function evento(pagoId: bigint, id: string, monto = "100.00", moneda = "MXN") {
  return {
    eventoId: id,
    tipo: "payment.updated",
    pagoId: String(pagoId),
    referencia: `payment-${pagoId}`,
    estado: "aprobado" as const,
    monto,
    moneda,
    payload: { status: "approved" },
  };
}

async function main() {
  const existentes = await admin.query(
    "SELECT id FROM orgs WHERE id IN (91,92)",
  );
  if (existentes.rowCount)
    throw new Error("La base pagos_test debe estar vacía");
  await admin.query(
    "INSERT INTO orgs (id,nombre,slug) VALUES (91,'Pagos A','pagos-a'),(92,'Pagos B','pagos-b')",
  );
  const pago = await runWithOrg(orgA, async () => {
    await db.moduloOrg.create({
      data: {
        clave: "pagos_en_linea",
        activo: true,
        config: { proveedor: "mock" },
      },
    });
    const venta = await db.venta.create({
      data: {
        folio: "V-PAGO-1",
        total: "100.00",
        subtotal: "100.00",
        moneda: "MXN",
        estado: "pendiente",
      },
    });
    return crearCheckoutVenta(
      { orgId: orgA, userId: null, rol: "admin", puesto: "Administrador" },
      {
        origenTipo: "venta",
        origenId: String(venta.id),
        idempotencyKey: "venta:e2e:primera",
      },
    );
  });

  const rechazado = await runWithOrg(orgA, () =>
    procesarEventoPago(
      orgA,
      "mock",
      evento(pago.id, "monto-invalido", "99.99"),
    ),
  );
  assert.equal(
    "rechazado" in rechazado && rechazado.rechazado,
    true,
    "monto distinto se rechaza y registra",
  );
  const monedaRechazada = await runWithOrg(orgA, () =>
    procesarEventoPago(orgA, "mock", evento(pago.id, "moneda-invalida", "100.00", "USD")),
  );
  assert.equal(
    "rechazado" in monedaRechazada && monedaRechazada.rechazado,
    true,
    "moneda distinta se rechaza y registra",
  );
  const aprobado = await runWithOrg(orgA, () =>
    procesarEventoPago(orgA, "mock", evento(pago.id, "aprobado-1")),
  );
  assert.equal(aprobado.duplicado, false);
  const duplicado = await runWithOrg(orgA, () =>
    procesarEventoPago(orgA, "mock", evento(pago.id, "aprobado-1")),
  );
  assert.equal(duplicado.duplicado, true);
  const concurrente = await runWithOrg(orgA, () =>
    Promise.allSettled([
      procesarEventoPago(orgA, "mock", evento(pago.id, "concurrente-1")),
      procesarEventoPago(orgA, "mock", evento(pago.id, "concurrente-1")),
    ]),
  );
  assert.equal(
    concurrente.filter((r) => r.status === "fulfilled").length,
    2,
    "ambos webhooks concurrentes reciben resultado idempotente",
  );

  await runWithOrg(orgA, async () => {
    assert.equal(
      await db.pagoVenta.count({ where: { ventaId: pago.origenId } }),
      1,
      "el origen se acredita una sola vez",
    );
    assert.equal(
      (await db.venta.findUniqueOrThrow({ where: { id: pago.origenId } }))
        .estado,
      "pagada",
    );
    const reembolso = await reembolsarPago(
      { orgId: orgA, userId: null, rol: "admin", puesto: "Administrador" },
      pago.id,
    );
    assert.equal(reembolso.estado, "aprobado");
    assert.equal(
      (await db.pagoOnline.findUniqueOrThrow({ where: { id: pago.id } }))
        .estado,
      "reembolsado",
    );
    assert.equal(
      (
        await reembolsarPago(
          { orgId: orgA, userId: null, rol: "admin", puesto: "Administrador" },
          pago.id,
        )
      ).estado,
      "aprobado",
      "reembolso repetido es idempotente",
    );
  });
  await runWithOrg(orgB, async () => {
    assert.equal(
      await db.pagoOnline.count(),
      0,
      "RLS oculta pagos de otra empresa",
    );
    assert.equal(
      await db.eventoPago.count(),
      0,
      "RLS oculta eventos de otra empresa",
    );
  });
  console.log(
    "pagos-online E2E: monto/moneda, duplicado, concurrencia, origen, reembolso y RLS OK",
  );
}

try {
  await main();
} finally {
  await admin.end();
  await dbRaw.$disconnect();
}
