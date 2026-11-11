import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import pg from "pg";
import { apiE2E, loginE2E, paginaE2E } from "./e2e-http";

const baseUrl = process.env.E2E_BASE_URL ?? "";
const adminUrl = process.env.ADMIN_DATABASE_URL ?? "";
if (!baseUrl || !adminUrl) throw new Error("Define E2E_BASE_URL y ADMIN_DATABASE_URL locales explícitas.");
const base = new URL(baseUrl);
const baseDatos = new URL(adminUrl);
if (
  !["localhost", "127.0.0.1"].includes(base.hostname) ||
  base.port !== "3120" ||
  !["localhost", "127.0.0.1"].includes(baseDatos.hostname) ||
  !["55433", "55451"].includes(baseDatos.port)
) {
  throw new Error("Esta prueba sólo admite HTTP local :3120 y una BD desechable local :55433 o :55451.");
}

const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const orgA = BigInt(Date.now()) * 1000n + 333n;
const orgB = orgA + 1n;
const slugA = `auditoria-e2e-a-${sufijo}`;
const slugB = `auditoria-e2e-b-${sufijo}`;
const password = "Auditoria-E2E-2026!";

type EvaluacionDto = {
  id: string;
  colaboradorId: string;
  evaluadorId: string;
  area: string;
  periodo: string;
  color: string;
  nota: string | null;
};

async function main() {
  await admin.query(
    "INSERT INTO orgs(id,nombre,slug) VALUES ($1,'Auditoría E2E A',$2),($3,'Auditoría E2E B',$4)",
    [String(orgA), slugA, String(orgB), slugB],
  );
  const hash = await bcrypt.hash(password, 10);
  const usuarios = [
    { org: orgA, nombre: "Admin A", email: `admin-${sufijo}@test.local`, rol: "admin", puesto: "Administrador" },
    { org: orgA, nombre: "Gerente A", email: `gerente-${sufijo}@test.local`, rol: "agente", puesto: "Gerente general" },
    { org: orgA, nombre: "Contador A", email: `contador-${sufijo}@test.local`, rol: "agente", puesto: "Contador" },
    { org: orgB, nombre: "Admin B", email: `admin-b-${sufijo}@test.local`, rol: "admin", puesto: "Administrador" },
  ] as const;
  const ids = new Map<string, string>();
  const idDe = (email: string) => {
    const id = ids.get(email);
    assert.ok(id, `Falta el usuario ${email}`);
    return id;
  };
  for (const usuario of usuarios) {
    const { rows } = await admin.query(
      "INSERT INTO usuarios(org_id,nombre,email,password_hash,rol,puesto) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id::text AS id",
      [String(usuario.org), usuario.nombre, usuario.email, hash, usuario.rol, usuario.puesto],
    );
    ids.set(usuario.email, rows[0].id);
  }
  await admin.query(
    "INSERT INTO modulos_org(org_id,clave,activo) VALUES ($1,'auditoria',true),($2,'auditoria',true)",
    [String(orgA), String(orgB)],
  );

  const adminA = await loginE2E(baseUrl, usuarios[0].email, slugA, password);
  const gerenteA = await loginE2E(baseUrl, usuarios[1].email, slugA, password);
  const contadorA = await loginE2E(baseUrl, usuarios[2].email, slugA, password);
  const adminB = await loginE2E(baseUrl, usuarios[3].email, slugB, password);

  assert.equal((await apiE2E(baseUrl, "", "/api/auditoria")).status, 307);
  assert.equal((await apiE2E(baseUrl, "", "/api/auditoria", "POST", {})).status, 307);
  assert.equal((await apiE2E(baseUrl, contadorA, "/api/auditoria")).status, 200);
  assert.equal(
    (await apiE2E(baseUrl, contadorA, "/api/auditoria", "POST", { colaboradorId: idDe(usuarios[2].email), area: "contabilidad", periodo: "2026-11", color: "verde" })).status,
    403,
  );
  assert.equal((await apiE2E(baseUrl, adminA, "/api/auditoria", "POST", { colaboradorId: idDe(usuarios[2].email), area: "ventas", periodo: "2026-11", color: "verde" })).status, 400);
  assert.equal((await apiE2E(baseUrl, adminA, "/api/auditoria", "POST", { colaboradorId: idDe(usuarios[2].email), area: "contabilidad", periodo: "2026-11", color: "azul" })).status, 400);
  assert.equal((await apiE2E(baseUrl, adminA, "/api/auditoria", "POST", { colaboradorId: idDe(usuarios[3].email), area: "contabilidad", periodo: "2026-11", color: "verde" })).status, 400);

  const creada = await apiE2E<{ evaluacion: EvaluacionDto }>(baseUrl, adminA, "/api/auditoria", "POST", {
    colaboradorId: idDe(usuarios[2].email),
    area: "contabilidad",
    periodo: "2026-11-15",
    color: "verde",
    nota: "Sin observaciones",
  });
  assert.equal(creada.status, 201);
  assert.equal(creada.data.evaluacion.periodo, "2026-11-01T00:00:00.000Z");
  assert.equal(creada.data.evaluacion.evaluadorId, idDe(usuarios[0].email));

  const actualizada = await apiE2E<{ evaluacion: EvaluacionDto }>(baseUrl, adminA, "/api/auditoria", "POST", {
    colaboradorId: idDe(usuarios[2].email),
    area: "contabilidad",
    periodo: "2026-11",
    color: "amarillo",
    nota: "Se solicitaron correcciones",
  });
  assert.equal(actualizada.status, 200);
  assert.equal(actualizada.data.evaluacion.id, creada.data.evaluacion.id, "el registro se actualiza, no se duplica");
  assert.equal(actualizada.data.evaluacion.color, "amarillo");

  await apiE2E(baseUrl, gerenteA, "/api/auditoria", "POST", {
    colaboradorId: idDe(usuarios[1].email),
    area: "administracion",
    periodo: "2026-11",
    color: "rojo",
  });

  const propias = await apiE2E<{ evaluaciones: EvaluacionDto[]; total: number }>(baseUrl, contadorA, "/api/auditoria?periodo=2026-11");
  assert.equal(propias.status, 200);
  assert.equal(propias.data.total, 1, "el colaborador sólo ve sus evaluaciones");
  assert.equal(propias.data.evaluaciones[0].colaboradorId, idDe(usuarios[2].email));

  const todas = await apiE2E<{ total: number }>(baseUrl, adminA, "/api/auditoria?periodo=2026-11");
  assert.equal(todas.data.total, 2, "dirección ve todas las evaluaciones del periodo");

  const ajenas = await apiE2E<{ total: number }>(baseUrl, adminB, "/api/auditoria?periodo=2026-11");
  assert.equal(ajenas.data.total, 0, "la otra organización no ve evaluaciones ajenas");

  const cambios = await admin.query<{ total: string }>(
    "SELECT count(*)::text AS total FROM auditoria_evaluacion_cambios WHERE evaluacion_id = $1",
    [creada.data.evaluacion.id],
  );
  assert.equal(cambios.rows[0].total, "2", "alta y cambio de color quedan en la bitácora");

  assert.equal(await paginaE2E(baseUrl, adminA, "/auditoria?mes=2026-11"), 200);
  assert.equal(await paginaE2E(baseUrl, contadorA, "/auditoria?mes=2026-11"), 200);
  const desactivado = await admin.query("UPDATE modulos_org SET activo=false WHERE org_id=$1 AND clave='auditoria'", [String(orgB)]);
  assert.equal(desactivado.rowCount, 1, "el m�dulo de la org B debe desactivarse");
  const respuestaSinModulo = await fetch(`${baseUrl}/auditoria?mes=2026-11`, { headers: { Cookie: adminB }, redirect: "manual" });
  const cuerpoSinModulo = await respuestaSinModulo.text();
  assert.ok(cuerpoSinModulo.includes("NEXT_REDIRECT"), "sin modulo la pagina redirige");
  assert.equal(respuestaSinModulo.status, 200, "sin módulo la página redirige");

  console.log("auditoría e2e: permisos, upsert, RLS y página OK");
}

async function limpiar() {
  await admin.query("SET session_replication_role = replica");
  try {
    await admin.query("DELETE FROM auditoria_evaluacion_cambios WHERE org_id IN ($1,$2)", [String(orgA), String(orgB)]);
    await admin.query("DELETE FROM auditoria_evaluaciones WHERE org_id IN ($1,$2)", [String(orgA), String(orgB)]);
    await admin.query("DELETE FROM modulos_org WHERE org_id IN ($1,$2)", [String(orgA), String(orgB)]);
    await admin.query("DELETE FROM usuarios WHERE org_id IN ($1,$2)", [String(orgA), String(orgB)]);
    await admin.query("DELETE FROM orgs WHERE id IN ($1,$2)", [String(orgA), String(orgB)]);
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
    await admin.end();
  });
