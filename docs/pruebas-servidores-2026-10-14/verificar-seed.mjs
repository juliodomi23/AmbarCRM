import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "../../web/node_modules/@prisma/client/default.js";

const url = new URL(process.env.DATABASE_URL ?? "");
assert.ok(["localhost","127.0.0.1"].includes(url.hostname) && url.pathname === "/crm_servidores", "Solo BD desechable crm_servidores");
const prisma = new PrismaClient();
const org = await prisma.org.findUniqueOrThrow({ where: { slug: "ambar-rojo" } });
async function tenant(fn) { return prisma.$transaction(async tx => { await tx.$executeRaw`SELECT set_config('app.current_org', ${String(org.id)}, true)`; return fn(tx); }); }
const originales = await tenant(tx => tx.servidor.findMany({orderBy:{id:"asc"}}));
assert.equal(originales.length,4);
const ids = originales.map(s=>s.id);
try {
  await tenant(async tx => {
    await tx.servidor.update({where:{id:ids[0]},data:{notas:"Editado por equipo",costoAnualMxn:"999.99",vence:new Date("2030-01-01")}});
    await tx.moduloOrg.update({where:{orgId_clave:{orgId:org.id,clave:"servidores"}},data:{activo:false}});
  });
  const snapshot = () => tenant(async tx => JSON.stringify({servidores:await tx.servidor.findMany({orderBy:{id:"asc"}}),modulo:await tx.moduloOrg.findFirst({where:{clave:"servidores"}}),heartbeats:await tx.heartbeatServidor.count()},(_,v)=>typeof v==="bigint"?String(v):v));
  const antes = await snapshot();
  const entorno = {...process.env,ORG_SLUG:"ambar-rojo",ALLOW_DEMO_SEED:"1",NODE_ENV:"development"};
  const salida = execFileSync(process.execPath,["scripts/seed-servidores.mjs"],{cwd:new URL("../../web/",import.meta.url),env:entorno,encoding:"utf8"});
  assert.doesNotMatch(salida,/TOKEN/);
  assert.match(salida,/0 servidores nuevos/);
  assert.equal(await snapshot(),antes,"No sobreescribir edición, token, vencimiento, carga ni activación");
  console.log(salida.trim());
  for (const [nombre,cambios] of [["sin ALLOW_DEMO_SEED",{ALLOW_DEMO_SEED:""}],["producción con autorización",{NODE_ENV:"production"}],["sin ORG_SLUG",{ORG_SLUG:""}]]) {
    let rechazado = false;
    try { execFileSync(process.execPath,["scripts/seed-servidores.mjs"],{cwd:new URL("../../web/",import.meta.url),env:{...entorno,...cambios},stdio:"pipe"}); }
    catch (error) { rechazado=true; assert.equal(error.status,1); console.log(`Guarda ${nombre}: EXIT 1 esperado · ${String(error.stderr).split("\n").find(l=>l.startsWith("Error:"))}`); }
    assert.ok(rechazado);
    assert.equal(await snapshot(),antes);
  }
  console.log("Seed idempotente y guardas OK; no tokens impresos en segunda ejecución, sin reportes, sin escrituras al rechazo.");
} finally {
  await tenant(async tx => {
    const s = originales[0];
    await tx.servidor.update({where:{id:s.id},data:{notas:s.notas,costoAnualMxn:s.costoAnualMxn,vence:s.vence}});
    await tx.moduloOrg.update({where:{orgId_clave:{orgId:org.id,clave:"servidores"}},data:{activo:true}});
  });
  await prisma.$disconnect();
}
