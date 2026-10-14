import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import pg from "pg";
import { dbRaw } from "../../src/lib/db";
import { transaccionTenant } from "../../src/lib/retail-db";
import { hoyAR } from "../../src/lib/contratos-cobros";

const baseUrl = process.env.E2E_BASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const appUrl = process.env.DATABASE_URL;
if (!baseUrl || !adminUrl || !appUrl || ![baseUrl,adminUrl,appUrl].every(url => ["127.0.0.1","localhost"].includes(new URL(url).hostname))) throw new Error("Usa únicamente app y BD desechables locales");
const admin = new pg.Pool({ connectionString: adminUrl });
const org = await dbRaw.org.findUniqueOrThrow({ where: { slug: "ambar-rojo" } });
assert.equal(org.id,1n,"El fixture AR debe ser la org plataforma");
const sufijo = String(Date.now());
const otra = await dbRaw.org.create({ data: { nombre:"Demo servidores E2E",slug:`servidores-demo-${sufijo}` } });
let cookie = "";
const creados: bigint[] = [];
const seed = await transaccionTenant(org.id, tx => tx.cobro.findFirstOrThrow({ where:{estado:"pagado",contrato:{contacto:{nombre:"Villafuerte y Asociados"}}} }));
const contratoSeed = await transaccionTenant(org.id, tx => tx.contrato.findUniqueOrThrow({where:{id:seed.contratoId}}));
const vencido = new Date(Date.parse(hoyAR())-20*86400000);

function cookies(res: Response) { return res.headers.getSetCookie().map(c=>c.split(";",1)[0]).join("; "); }
async function login(email: string, slug: string) {
  const csrf = await fetch(`${baseUrl}/api/auth/csrf`);
  const actual = cookies(csrf);
  const {csrfToken} = await csrf.json();
  const res = await fetch(`${baseUrl}/api/auth/callback/credentials`, {method:"POST",redirect:"manual",headers:{Cookie:actual,"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({csrfToken,email,password:"AR-Prueba-2026",orgSlug:slug,json:"true",callbackUrl:`${baseUrl}/servidores`})});
  const resultado = `${actual}; ${cookies(res)}`;
  assert.match(resultado,/next-auth.session-token/);
  return resultado;
}
async function api(ruta: string, metodo="GET", body?: unknown, sesion=cookie, headers: Record<string,string>={}) {
  const res = await fetch(`${baseUrl}${ruta}`,{method:metodo,redirect:"manual",headers:{Cookie:sesion,"Content-Type":"application/json",...headers},body:body===undefined ? undefined : JSON.stringify(body)});
  return {status:res.status,data:await res.json().catch(()=>({}))};
}
const datos = {nombre:`Servidor E2E ${sufijo}`,proveedor:"Prueba",ip:"127.0.0.1",propietario:"AR",loPagamos:true,costoAnualMxn:"100.01",vence:hoyAR()};
const payload = {ram_pct:91,cpu_pct:10,disco_pct:20,ram_total_mb:8192,uptime_horas:12};
try {
  cookie = await login("admin@ambar-rojo.local.test","ambar-rojo");
  assert.equal((await api("/api/servidores","POST",null)).status,400);
  const creada = await api("/api/servidores","POST",datos);
  assert.equal(creada.status,201);
  const id = BigInt(creada.data.servidor.id); creados.push(id);
  const token = creada.data.token;
  assert.match(token,/^[a-f0-9]{64}$/);
  assert.ok(!("heartbeatTokenHash" in creada.data.servidor));
  const lista = await api("/api/servidores");
  const s = lista.data.servidores.find((s:{id:string})=>s.id===String(id));
  assert.equal(s.estado,"sin-datos");
  assert.ok(!JSON.stringify(lista.data).includes(token));
  assert.ok(!("heartbeatTokenHash" in s));
  assert.equal((await api("/api/servidores","POST",datos)).status,409);
  const beat = (clave: string, body: unknown=payload) => api("/api/servidores/heartbeat","POST",body,"",{"X-Heartbeat-Token":clave});
  assert.equal((await api("/api/servidores/heartbeat","POST",payload,"")).status,401);
  assert.equal((await beat("incorrecto")).status,401);
  assert.equal((await beat(token,{...payload,ram_pct:101})).status,400);
  assert.equal((await beat(token,{...payload,cpu_pct:-1})).status,400);
  assert.equal((await beat(token,{...payload,disco_pct:"90"})).status,400);
  const concurrentes = await Promise.all([beat(token),beat(token),beat(token)]);
  assert.deepEqual(concurrentes.map(r=>r.status).sort(),[201,204,204]);
  const salud = (await api("/api/servidores")).data.servidores.find((s:{id:string})=>s.id===String(id));
  assert.equal(salud.estado,"rojo"); assert.match(salud.motivo,/RAM 91/);
  assert.equal(salud.historial.length,1);
  assert.equal(salud.ultimo.ramTotalMb,8192);
  const regenerada = await api(`/api/servidores/${id}/token`,"POST");
  assert.equal(regenerada.status,200);
  assert.notEqual(regenerada.data.token,token);
  assert.equal((await beat(token)).status,401);
  await admin.query("UPDATE servidores SET ultimo_reporte=now()-interval '2 minutes' WHERE id=$1",[String(id)]);
  assert.equal((await beat(regenerada.data.token)).status,201);
  assert.equal((await api(`/api/servidores/${id}`,"PATCH",{nombre:`Editado ${sufijo}`})).status,200);
  assert.equal((await api(`/api/contratos/${seed.contratoId}`,"PATCH",{servidorId:String(id)})).status,200);
  assert.ok((await api("/api/servidores")).data.servidores.find((s:{id:string})=>s.id===String(id)).contratos.some((c:{id:string})=>c.id===String(seed.contratoId)));
  await transaccionTenant(otra.id,async tx=>{
    await tx.usuario.create({data:{nombre:"Admin demo",email:`demo-${sufijo}@local.test`,passwordHash:await bcrypt.hash("AR-Prueba-2026",10),rol:"admin",puesto:"Administrador"}});
    await tx.moduloOrg.createMany({data:["servidores","panel_ar","contratos"].map(clave=>({clave,activo:true}))});
  });
  const demo = await login(`demo-${sufijo}@local.test`,otra.slug);
  assert.equal((await api("/api/servidores","GET",undefined,demo)).status,404);
  assert.equal((await api("/api/servidores","POST",datos,demo)).status,404);
  assert.equal((await api(`/api/servidores/${id}`,"PATCH",datos,demo)).status,404);
  assert.equal((await api(`/api/servidores/${id}/token`,"POST",undefined,demo)).status,404);
  assert.equal((await api("/api/panel-ar/alertas","GET",undefined,demo)).status,404);
  assert.ok(!(await api("/api/modulos","GET",undefined,demo)).data.modulos.some((m:{clave:string})=>m.clave==="servidores"),"menú y Ctrl+K usan el mismo catálogo filtrado");
  assert.equal((await api("/api/modulos","POST",{orgId:String(otra.id),clave:"servidores",activo:true})).status,404);
  const paginaDemo = await fetch(`${baseUrl}/servidores`,{headers:{Cookie:demo}});
  const htmlDemo = await paginaDemo.text();
  // Next puede haber enviado 200 al iniciar el stream antes de resolver notFound.
  assert.match(htmlDemo,/This page could not be found|NEXT_HTTP_ERROR_FALLBACK;404/);
  assert.ok(!htmlDemo.includes("data-servidor-id"));
  await transaccionTenant(org.id,tx=>tx.usuario.create({data:{nombre:"Agente",email:`agente-servidor-${sufijo}@local.test`,passwordHash:bcrypt.hashSync("AR-Prueba-2026",10),rol:"admin",puesto:"Agente"}}));
  const agente = await login(`agente-servidor-${sufijo}@local.test`,org.slug);
  assert.equal((await api("/api/servidores","GET",undefined,agente)).status,403,"ni rol admin sin puesto Administrador accede al costo");
  assert.equal((await api("/api/panel-ar/alertas","GET",undefined,agente)).status,403);
  await transaccionTenant(org.id,tx=>tx.cobro.update({where:{id:seed.id},data:{estado:"vencido",montoPagado:"100",vence:vencido}}));
  const alertas = await api("/api/panel-ar/alertas");
  assert.equal(alertas.status,200);
  assert.ok(alertas.data.lista.some((a:{tipo:string;texto:string})=>a.tipo==="cobro" && a.texto.includes(seed.monto.minus(100).toFixed(2)) && a.texto.includes("20 días")));
  assert.equal(alertas.data.lista[0].nivel,"rojo");
  assert.equal((await api("/api/panel-ar/alertas","GET",undefined,"",{"x-api-key":"incorrecta"})).status,401);
  assert.equal((await api("/api/panel-ar/alertas","GET",undefined,"")).status,401);
  assert.equal((await api("/api/panel-ar/alertas","GET",undefined,"",{"x-api-key":process.env.WA_API_KEY!})).status,200);
  await transaccionTenant(org.id,tx=>tx.cobro.update({where:{id:seed.id},data:{estado:"incobrable"}}));
  assert.ok(!(await api("/api/panel-ar/alertas")).data.lista.some((a:{texto:string})=>a.texto.includes(`#${seed.id})`)));
  await admin.query("INSERT INTO heartbeats_servidor(org_id,servidor_id,fecha,ram_pct,cpu_pct,disco_pct,ram_total_mb,uptime_horas) VALUES(1,$1,now()-interval '31 days',10,10,10,1024,5)",[String(id)]);
  assert.equal((await api("/api/cron/limpiar-heartbeats","POST",undefined,"")).status,401);
  const limpieza = await api("/api/cron/limpiar-heartbeats","POST",undefined,"",{"x-api-key":process.env.WA_API_KEY!});
  assert.equal(limpieza.status,200); assert.ok(limpieza.data.eliminados>=1);
  assert.equal((await admin.query("SELECT count(*) FROM heartbeats_servidor WHERE servidor_id=$1",[String(id)])).rows[0].count,"2");
  assert.equal((await fetch(`${baseUrl}/servidores`,{headers:{Cookie:cookie}})).status,200);
  console.log("servidores E2E: alta/token único, sin datos, rangos, heartbeat concurrente 201/204/204, estado rojo, edición/cargas, rotación 401/201, demo catálogo oculto/API 404/página sin datos, puesto 403, saldo parcial del seed y atraso, incobrable excluido, n8n key 401/200, retención 30 días OK; cero envíos");
} finally {
  await admin.query("UPDATE cobros SET estado=$2,monto_pagado=$3,vence=$4 WHERE id=$1",[String(seed.id),seed.estado,seed.montoPagado.toString(),seed.vence]);
  await admin.query("UPDATE contratos SET servidor_id=NULL WHERE servidor_id=ANY($1::bigint[])",[creados.map(String)]);
  await admin.query("UPDATE contratos SET servidor_id=$2 WHERE id=$1",[String(seed.contratoId),contratoSeed.servidorId?.toString() ?? null]);
  await admin.query("DELETE FROM servidores WHERE id=ANY($1::bigint[])",[creados.map(String)]);
  await admin.query("DELETE FROM usuarios WHERE org_id=$1 AND email=$2",[String(org.id),`agente-servidor-${sufijo}@local.test`]);
  for(const tabla of ["usuarios","modulos_org"]) await admin.query(`DELETE FROM ${tabla} WHERE org_id=$1`,[String(otra.id)]);
  await admin.query("DELETE FROM orgs WHERE id=$1",[String(otra.id)]);
  await Promise.all([admin.end(),dbRaw.$disconnect()]);
}
