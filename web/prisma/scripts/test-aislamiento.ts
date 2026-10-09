/**
 * Audita dinámicamente todas las tablas públicas que tienen org_id.
 * Requiere DATABASE_URL=crm_app y ADMIN_DATABASE_URL=dueño/superusuario.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const appUrl = process.env.DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
if (!appUrl || !adminUrl) {
  throw new Error("Define DATABASE_URL (crm_app) y ADMIN_DATABASE_URL (dueño)");
}

const app = new Pool({ connectionString: appUrl, max: 8 });
const admin = new Pool({ connectionString: adminUrl, max: 1 });
const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const orgA = BigInt(Date.now()) * 1000n + 101n;
const orgB = orgA + 1n;

type Columna = {
  column_name: string;
  data_type: string;
  udt_name: string;
  column_default: string | null;
  is_nullable: "YES" | "NO";
  is_identity: "YES" | "NO";
  is_generated: "ALWAYS" | "NEVER";
  character_maximum_length: number | null;
};

function identificador(valor: string) {
  return `"${valor.replaceAll('"', '""')}"`;
}

async function valorColumna(columna: Columna, tabla: string, indice: number) {
  if (columna.column_name === "org_id") return orgA.toString();
  if (tabla === "cotizaciones" && columna.column_name === "token_publico") return "a".repeat(32);
  if (tabla === "movimientos_caja" && columna.column_name === "tipo") return "entrada";
  if (tabla === "pagos_venta" && columna.column_name === "metodo") return "efectivo";
  if (tabla === "devoluciones_venta" && columna.column_name === "tipo_reembolso") return "efectivo";
  if (tabla === "apartados" && columna.column_name === "estado") return "activo";
  if (tabla === "abonos_apartado" && columna.column_name === "metodo") return "efectivo";
  if (tabla === "movimientos_cuenta_cliente" && columna.column_name === "tipo") return "cargo";
  if (columna.data_type === "USER-DEFINED") {
    const resultado = await admin.query<{ valor: string }>(
      `SELECT e.enumlabel AS valor
       FROM pg_type t
       JOIN pg_enum e ON e.enumtypid = t.oid
       WHERE t.typname = $1
       ORDER BY e.enumsortorder
       LIMIT 1`,
      [columna.udt_name],
    );
    if (!resultado.rows[0]) throw new Error(`Enum sin valores: ${columna.udt_name}`);
    return resultado.rows[0].valor;
  }
  // Columnas con CHECK de rango (reservas en línea): valores válidos fijos.
  const enterosFijos: Record<string, number> = { dia_semana: 1, inicio_min: 540, fin_min: 600, duracion_min: 30, buffer_min: 0 };
  if (columna.column_name in enterosFijos) return enterosFijos[columna.column_name];
  if (["bigint", "integer", "smallint"].includes(columna.data_type)) {
    return 8_000_000 + indice;
  }
  if (["numeric", "decimal", "real", "double precision"].includes(columna.data_type)) {
    return 1;
  }
  if (columna.data_type === "boolean") return false;
  if (columna.data_type.includes("timestamp")) return new Date();
  if (columna.data_type === "date") return "2026-10-08";
  if (columna.data_type.includes("time")) return "12:00:00";
  if (["json", "jsonb"].includes(columna.data_type)) return {};
  if (columna.data_type === "uuid") return randomUUID();
  if (columna.data_type === "bytea") return Buffer.from("aislamiento");
  if (columna.data_type === "ARRAY") return [];
  const texto = `rls-${tabla}-${columna.column_name}-${sufijo}`;
  return columna.character_maximum_length
    ? texto.slice(0, columna.character_maximum_length)
    : texto;
}

async function insertarMarcador(tabla: string, columnas: Columna[]) {
  const requeridas = columnas.filter((columna) =>
    columna.column_name === "org_id" ||
    (tabla === "notas_credito_cliente" && columna.column_name === "apartado_id") ||
    (
      columna.is_nullable === "NO" &&
      columna.column_default === null &&
      columna.is_identity === "NO" &&
      columna.is_generated !== "ALWAYS"
    ),
  );
  const valores = [];
  for (const [indice, columna] of requeridas.entries()) {
    valores.push(await valorColumna(columna, tabla, indice));
  }
  const nombres = requeridas.map((columna) => identificador(columna.column_name));
  const parametros = valores.map((_, indice) => `$${indice + 1}`);
  const resultado = await admin.query<{ fila: string }>(
    `INSERT INTO ${identificador(tabla)} (${nombres.join(", ")})
     VALUES (${parametros.join(", ")})
     RETURNING ctid::text AS fila`,
    valores,
  );
  return resultado.rows[0].fila;
}

async function consultaTenant(orgId: bigint, sql: string, valores: unknown[] = []) {
  const cliente = await app.connect();
  try {
    await cliente.query("BEGIN");
    await cliente.query("SELECT set_config('app.current_org', $1, true)", [String(orgId)]);
    return await cliente.query(sql, valores);
  } finally {
    await cliente.query("ROLLBACK");
    cliente.release();
  }
}

async function main() {
  await admin.query(
    `INSERT INTO orgs (id, nombre, slug) VALUES
      ($1, 'Aislamiento A', $2), ($3, 'Aislamiento B', $4)`,
    [orgA.toString(), `aislamiento-a-${sufijo}`, orgB.toString(), `aislamiento-b-${sufijo}`],
  );
  const tablas = await admin.query<{ table_name: string }>(
    `SELECT c.table_name
     FROM information_schema.columns c
     JOIN information_schema.tables t
       ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = 'public' AND c.column_name = 'org_id'
       AND t.table_type = 'BASE TABLE'
     ORDER BY c.table_name`,
  );
  assert.ok(tablas.rowCount && tablas.rowCount > 0, "No se encontraron tablas con org_id");

  await admin.query("SET session_replication_role = replica");
  const marcadores: Array<{ tabla: string; fila: string }> = [];
  try {
    for (const { table_name: tabla } of tablas.rows) {
      const metadatos = await admin.query<Columna>(
        `SELECT column_name, data_type, udt_name, column_default, is_nullable,
                is_identity, is_generated, character_maximum_length
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [tabla],
      );
      marcadores.push({ tabla, fila: await insertarMarcador(tabla, metadatos.rows) });
    }
  } finally {
    await admin.query("SET session_replication_role = origin");
  }

  for (const { tabla, fila } of marcadores) {
    const nombre = identificador(tabla);
    const propio = await consultaTenant(
      orgA,
      `SELECT count(*)::text AS total FROM ${nombre} WHERE ctid = $1::tid`,
      [fila],
    );
    assert.equal(propio.rows[0].total, "1", `${tabla}: A no puede leer su propia fila`);

    const ajeno = await consultaTenant(
      orgB,
      `SELECT count(*)::text AS total FROM ${nombre} WHERE ctid = $1::tid`,
      [fila],
    );
    assert.equal(ajeno.rows[0].total, "0", `${tabla}: B leyó una fila de A`);

    const escritura = await consultaTenant(
      orgB,
      `UPDATE ${nombre} SET org_id = org_id WHERE ctid = $1::tid RETURNING org_id`,
      [fila],
    );
    assert.equal(escritura.rowCount, 0, `${tabla}: B modificó una fila de A`);
  }

  const cobertura = await admin.query<{ total: string }>(
    `SELECT count(DISTINCT c.oid)::text AS total
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     JOIN information_schema.columns i
       ON i.table_schema = n.nspname AND i.table_name = c.relname
     WHERE n.nspname = 'public' AND i.column_name = 'org_id'
       AND c.relkind = 'r' AND c.relrowsecurity`,
  );
  assert.equal(
    Number(cobertura.rows[0].total),
    tablas.rows.length,
    "Todas las tablas con org_id deben tener RLS activo",
  );
  console.log(`OK · aislamiento de lectura y escritura en ${tablas.rows.length} tablas`);
}

async function limpiar() {
  await admin.query("SET session_replication_role = replica");
  try {
    const tablas = await admin.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name = 'org_id'`,
    );
    for (const { table_name: tabla } of tablas.rows) {
      await admin.query(`DELETE FROM ${identificador(tabla)} WHERE org_id IN ($1, $2)`, [
        orgA.toString(),
        orgB.toString(),
      ]);
    }
    await admin.query("DELETE FROM orgs WHERE id IN ($1, $2)", [
      orgA.toString(),
      orgB.toString(),
    ]);
  } finally {
    await admin.query("SET session_replication_role = origin");
  }
}

main()
  .catch((error) => {
    console.error("FALLO:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await limpiar().catch((error) => console.error("No se pudo limpiar:", error.message));
    await Promise.all([app.end(), admin.end()]);
  });
