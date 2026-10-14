import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { PrismaClient } from "../../web/node_modules/@prisma/client/default.js";

const url = new URL(process.env.DATABASE_URL ?? "");
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "55453" && url.pathname === "/crm", "Solo PostgreSQL desechable local de este merge");
const prisma = new PrismaClient();
const org = await prisma.org.findUniqueOrThrow({ where: { slug: "inicial" } });
assert.equal(org.id, 1n);
const entorno = { ...process.env, ORG_SLUG: "inicial", ALLOW_DEMO_SEED: "1" };
delete entorno.NODE_ENV;
const opciones = { cwd: new URL("../../web/", import.meta.url), env: entorno, encoding: "utf8" };
const json = valor => JSON.stringify(valor, (_, v) => typeof v === "bigint" ? String(v) : v);
async function snapshot() {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT set_config('app.current_org', ${String(org.id)}, true)`;
    return json({ servidores: await tx.servidor.findMany({ orderBy: { id: "asc" } }), contratos: await tx.contrato.findMany({ orderBy: { id: "asc" } }), modulo: await tx.moduloOrg.findFirst({ where: { clave: "servidores" } }), heartbeats: await tx.heartbeatServidor.count() });
  });
}
try {
  const primera = execFileSync(process.execPath, ["scripts/seed-servidores.mjs"], opciones);
  assert.equal((primera.match(/TOKEN \(única vez\): [a-f0-9]{64}/g) ?? []).length, 4);
  await writeFile(new URL("seed-servidores-1.txt", import.meta.url), primera.replace(/TOKEN \(única vez\): [a-f0-9]{64}/g, "TOKEN (única vez): [OMITIDO]") + "EXIT 0\n");
  const antes = await snapshot();
  const segunda = execFileSync(process.execPath, ["scripts/seed-servidores.mjs"], opciones);
  assert.doesNotMatch(segunda, /TOKEN/);
  assert.match(segunda, /0 servidores nuevos/);
  assert.equal(await snapshot(), antes, "La segunda corrida no cambia servidores, hashes, contratos, módulo ni reportes");
  await writeFile(new URL("seed-servidores-2.txt", import.meta.url), segunda + "EXIT 0\n");
  console.log("Seed inicial/id=1: primera corrida 4 servidores y 4 tokens omitidos del log; segunda corrida 0 nuevos, 0 tokens, snapshot completo idéntico y 0 heartbeats. NODE_ENV sin definir. EXIT 0");
} finally { await prisma.$disconnect(); }
