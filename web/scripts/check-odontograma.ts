import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import pg from "pg";

const connectionString = process.env.ODONTOGRAMA_TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error("Define ODONTOGRAMA_TEST_DATABASE_URL con una base desechable para ejecutar check:odontograma");
}
const nombreBase = new URL(connectionString).pathname.slice(1);
if (!/(test|tmp|disposable)/i.test(nombreBase) || /(prod|production)/i.test(nombreBase)) {
  throw new Error("La base de ODONTOGRAMA_TEST_DATABASE_URL debe ser desechable y llamarse *test*, *tmp* o *disposable*");
}

const rutaSql = new URL("../prisma/sql/actualizaciones.sql", import.meta.url);
const sqlActualizaciones = readFileSync(rutaSql, "utf8");
const ddl = sqlActualizaciones.match(/CREATE TABLE IF NOT EXISTS odontograma_zonas \([\s\S]*?\n\);/)?.[0];
assert.ok(ddl, "actualizaciones.sql debe declarar odontograma_zonas");
const indice = "CREATE INDEX IF NOT EXISTS odontograma_zonas_org_idx ON odontograma_zonas(org_id);";
assert.ok(sqlActualizaciones.includes(indice), "actualizaciones.sql debe indexar org_id");

const rutaApi = new URL("../src/app/api/contactos/[id]/odontograma/route.ts", import.meta.url);
const codigoApi = readFileSync(rutaApi, "utf8");
assert.match(codigoApi, /DIENTES_VALIDOS/);
assert.match(codigoApi, /ZONAS_VALIDAS/);
assert.match(codigoApi, /ESTADOS_VALIDOS/);
assert.match(codigoApi, /status: 400/g);
assert.match(codigoApi, /estado === "sano"[\s\S]*?deleteMany/);
assert.match(codigoApi, /requireModuloActivo\("pacientes"/);

const cliente = new pg.Client({ connectionString, application_name: "check-odontograma-desechable", connectionTimeoutMillis: 5000 });
const esquema = `check_odontograma_${randomUUID().replaceAll("-", "")}`;
const identificador = `"${esquema}"`;
let conectado = false;
try {
  await cliente.connect();
  conectado = true;
  await cliente.query(`CREATE SCHEMA ${identificador}`);
  await cliente.query(`SET search_path TO ${identificador}, public`);
  await cliente.query("CREATE TABLE orgs (id BIGINT PRIMARY KEY)");
  await cliente.query("CREATE TABLE usuarios (id BIGINT PRIMARY KEY)");
  await cliente.query("CREATE TABLE expedientes_paciente (id BIGINT PRIMARY KEY)");
  await cliente.query("INSERT INTO orgs (id) VALUES (1), (2)");
  await cliente.query("INSERT INTO usuarios (id) VALUES (10)");
  await cliente.query("INSERT INTO expedientes_paciente (id) VALUES (100), (200)");

  await cliente.query(ddl);
  await cliente.query(indice);
  await cliente.query(ddl);
  await cliente.query(indice);
  await cliente.query("ALTER TABLE odontograma_zonas ENABLE ROW LEVEL SECURITY");
  await cliente.query("CREATE POLICY org_isolation ON odontograma_zonas USING (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint) WITH CHECK (org_id = NULLIF(current_setting('app.current_org', true), '')::bigint)");
  await cliente.query(`GRANT USAGE ON SCHEMA ${identificador} TO crm_app`);
  await cliente.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON odontograma_zonas TO crm_app`);
  await cliente.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${identificador} TO crm_app`);

  await cliente.query("SET app.current_org = '1'");
  await cliente.query("INSERT INTO odontograma_zonas (org_id, expediente_id, diente, zona, estado, actualizado_por_id) VALUES (1, 100, 11, 'vestibular', 'caries', 10), (2, 200, 21, 'mesial', 'restaurado', 10)");
  await cliente.query("SET ROLE crm_app");
  await cliente.query("SET app.current_org = '1'");

  for (const datos of [
    { expediente: 100, diente: 19, zona: "vestibular", estado: "caries" },
    { expediente: 100, diente: 11, zona: "palatina", estado: "caries" },
    { expediente: 100, diente: 11, zona: "vestibular", estado: "sano-no-valido" },
  ]) {
    await assert.rejects(() => cliente.query(
      "INSERT INTO odontograma_zonas (expediente_id, diente, zona, estado) VALUES ($1, $2, $3, $4)",
      [datos.expediente, datos.diente, datos.zona, datos.estado],
    ));
    await cliente.query("ROLLBACK");
  }

  const guardar = (estado: string) => cliente.query(
    `INSERT INTO odontograma_zonas (expediente_id, diente, zona, estado, actualizado_por_id)
     VALUES (100, 11, 'vestibular', $1, 10)
     ON CONFLICT (expediente_id, diente, zona) DO UPDATE SET estado = EXCLUDED.estado, actualizado_por_id = EXCLUDED.actualizado_por_id`,
    [estado],
  );
  await guardar("corona");
  await guardar("endodoncia");
  const cantidad = await cliente.query("SELECT count(*)::int AS total FROM odontograma_zonas WHERE expediente_id = 100 AND diente = 11 AND zona = 'vestibular'");
  const estadoGuardado = await cliente.query("SELECT estado FROM odontograma_zonas WHERE expediente_id = 100 AND diente = 11 AND zona = 'vestibular'");
  assert.equal(cantidad.rows[0].total, 1, "repetir el PUT conserva una fila por zona");
  assert.equal(estadoGuardado.rows[0].estado, "endodoncia", "el PUT repetido actualiza el estado");

  await cliente.query("DELETE FROM odontograma_zonas WHERE expediente_id = 100 AND diente = 11 AND zona = 'vestibular'");
  const borrado = await cliente.query("SELECT count(*)::int AS total FROM odontograma_zonas WHERE expediente_id = 100 AND diente = 11 AND zona = 'vestibular'");
  assert.equal(borrado.rows[0].total, 0, "sano borra la zona registrada");

  const visibleOtraOrg = await cliente.query("SELECT count(*)::int AS total FROM odontograma_zonas WHERE expediente_id = 200");
  const modificadasOtraOrg = await cliente.query("UPDATE odontograma_zonas SET estado = 'caries' WHERE expediente_id = 200");
  assert.equal(visibleOtraOrg.rows[0].total, 0, "RLS oculta los registros de otra organización");
  assert.equal(modificadasOtraOrg.rowCount, 0, "RLS impide modificar registros de otra organización");

  await cliente.query("RESET ROLE");
  await cliente.query("SET app.current_org = '2'");
  const estadoOtraOrg = await cliente.query("SELECT estado FROM odontograma_zonas WHERE expediente_id = 200");
  assert.equal(estadoOtraOrg.rows[0].estado, "restaurado", "el aislamiento preserva el estado de la otra organización");
  console.log("check:odontograma OK · DDL idempotente, validaciones, upsert, borrado sano y RLS multiempresa");
} finally {
  if (conectado) {
    await cliente.query("RESET ROLE").catch(() => undefined);
    await cliente.query(`DROP SCHEMA IF EXISTS ${identificador} CASCADE`).catch(() => undefined);
  }
  await cliente.end().catch(() => undefined);
}
