import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import pg from "pg";

const adminUrl = process.env.ADMIN_DATABASE_URL;
assert.ok(adminUrl, "Define ADMIN_DATABASE_URL explícita; este seed no carga archivos .env.");
const password = process.env.FASE3_DEMO_PASSWORD;
assert.ok(password && password.length >= 12, "Define FASE3_DEMO_PASSWORD con al menos 12 caracteres para la demo local.");
const destino = new URL(adminUrl);
assert.ok(["127.0.0.1", "localhost"].includes(destino.hostname) && destino.port === "55451",
  "Seed permitido solamente en la base local desechable del puerto 55451.");
const pool = new pg.Pool({ connectionString: adminUrl, max: 1 });
const cliente = await pool.connect();
try {
  await cliente.query("BEGIN");
  const org = await cliente.query("INSERT INTO orgs(nombre,slug) VALUES ('Demo Marketing · Fase 3','fase3-demo') ON CONFLICT (slug) DO UPDATE SET nombre=EXCLUDED.nombre RETURNING id");
  const orgId = org.rows[0].id;
  const hash = await bcrypt.hash(password, 10);
  for (const usuario of [
    { nombre: "Administración de Marketing", email: "marketing@local.test", rol: "admin", puesto: "Administrador" },
    { nombre: "Equipo de Marketing", email: "mercadotecnia@local.test", rol: "agente", puesto: "Mercadotecnia" },
  ]) {
    await cliente.query(`INSERT INTO usuarios(org_id,nombre,email,password_hash,rol,puesto)
      VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (org_id,email) DO UPDATE
      SET nombre=EXCLUDED.nombre,password_hash=EXCLUDED.password_hash,rol=EXCLUDED.rol,puesto=EXCLUDED.puesto,activo=true`,
    [orgId, usuario.nombre, usuario.email, hash, usuario.rol, usuario.puesto]);
  }
  for (const clave of ["marketing", "meta_ads"]) {
    await cliente.query("INSERT INTO modulos_org(org_id,clave,activo) VALUES ($1,$2,true) ON CONFLICT (org_id,clave) DO UPDATE SET activo=true", [orgId, clave]);
  }
  await cliente.query("COMMIT");
  console.log("Fixture local preparado: organización fase3-demo; administrador marketing@local.test y agente mercadotecnia@local.test. Ambos módulos activos, sin campañas prefabricadas.");
} catch (error) {
  await cliente.query("ROLLBACK");
  throw error;
} finally {
  cliente.release();
  await pool.end();
}
