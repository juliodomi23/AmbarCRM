/**
 * Check de aislamiento multi-tenant. Falla si RLS no protege.
 *
 * Corre con DATABASE_URL apuntando al rol `crm_app` (NO al dueño: el dueño salta RLS):
 *   npx tsx prisma/scripts/test-aislamiento.ts
 *
 * Crea dos orgs de prueba y verifica que cada tenant solo ve lo suyo, incluso
 * "olvidando" el filtro (la query confía en RLS, no en un where manual).
 */
import assert from "node:assert";
import { db, runWithOrg } from "../../src/lib/db";

async function main() {
  const sufijo = Date.now();
  const a = await db.org.create({ data: { nombre: "Test A", slug: `test-a-${sufijo}` } });
  const b = await db.org.create({ data: { nombre: "Test B", slug: `test-b-${sufijo}` } });

  // org_id NO se pasa: lo autollena el DEFAULT desde el contexto de la transacción.
  await runWithOrg(a.id, () => db.contacto.create({ data: { nombre: "Contacto A" } }));
  await runWithOrg(b.id, () => db.contacto.create({ data: { nombre: "Contacto B" } }));

  const vistosA = await runWithOrg(a.id, () => db.contacto.findMany()); // sin where: confía en RLS
  assert(vistosA.length >= 1, "A debería ver su contacto");
  assert(vistosA.every((c) => c.orgId === a.id), "FUGA: el tenant A vio datos de otra org");

  const vistosB = await runWithOrg(b.id, () => db.contacto.findMany());
  assert(vistosB.every((c) => c.orgId === b.id), "FUGA: el tenant B vio datos de otra org");

  // Sin contexto, RLS debe devolver 0 filas (fail-closed).
  const sinContexto = await db.contacto.findMany().catch(() => []);
  assert(sinContexto.length === 0, "Sin tenant no debería verse ningún contacto");

  console.log("OK · aislamiento RLS correcto");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FALLO:", e.message);
    process.exit(1);
  });
