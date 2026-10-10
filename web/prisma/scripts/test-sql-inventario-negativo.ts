/**
 * Las ventas sin internet (A5) pueden dejar existencia negativa a propósito, así que el esquema
 * armado con los SQL de producción (schema.sql + multi-tenant.sql + actualizaciones.sql) no debe
 * tener CHECK que lo impida. `prisma db push` no crea esos CHECK: esta prueba solo dice algo
 * sobre una BD armada con SQL (como el init de docker-compose).
 *
 * ADMIN_DATABASE_URL=<dueño> npx tsx prisma/scripts/test-sql-inventario-negativo.ts
 */
import assert from "node:assert/strict";
import pg from "pg";

const url = process.env.ADMIN_DATABASE_URL;
if (!url) throw new Error("Define ADMIN_DATABASE_URL (dueño)");
const cliente = new pg.Client({ connectionString: url });
await cliente.connect();
try {
  const { rows } = await cliente.query<{ tabla: string; definicion: string }>(
    `SELECT conrelid::regclass::text AS tabla, pg_get_constraintdef(oid) AS definicion
       FROM pg_constraint
      WHERE contype = 'c'
        AND conrelid IN ('productos'::regclass, 'movimientos_inventario'::regclass)`,
  );
  const bloquean = rows.filter((r) => /\b(stock|existencia_antes|existencia_despues)\b\s*>=/.test(r.definicion));
  assert.deepEqual(bloquean, [], "ningún CHECK debe impedir stock o existencia negativos");
  assert.ok(
    rows.some((r) => /stock_minimo\s*>=/.test(r.definicion)),
    "el stock mínimo sigue sin aceptar negativos",
  );
  console.log("OK · el esquema permite existencia negativa (stock_minimo sigue >= 0)");
} finally {
  await cliente.end();
}
