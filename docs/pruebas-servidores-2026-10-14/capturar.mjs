import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "../../web/node_modules/@prisma/client/default.js";

const base = process.env.E2E_BASE_URL;
const moduloPlaywright = process.env.PLAYWRIGHT_MODULE;
if (!base || !moduloPlaywright) throw new Error("Define E2E_BASE_URL y PLAYWRIGHT_MODULE del runtime local");
assert.ok(["localhost","127.0.0.1"].includes(new URL(base).hostname));
assert.equal(new URL(process.env.DATABASE_URL).pathname,"/crm_servidores");
const { chromium } = await import(moduloPlaywright);
const prisma = new PrismaClient();
const destino = new URL("../capturas/servidores-2026-10-14/",import.meta.url);
await mkdir(destino,{recursive:true});
const browser = await chromium.launch({headless:true,channel:"msedge"});
const context = await browser.newContext({baseURL:base,viewport:{width:1440,height:1000}});
const page = await context.newPage();
const errores = [];
page.on("pageerror",e=>errores.push(e.message));
async function tenant(fn) { return prisma.$transaction(async tx => { await tx.$executeRaw`SELECT set_config('app.current_org', '1', true)`; return fn(tx); }); }
const idsReportes = [];
let cobroOriginal;
const medidas = [];
try {
  const csrf = await context.request.get("/api/auth/csrf");
  const {csrfToken} = await csrf.json();
  await context.request.post("/api/auth/callback/credentials",{form:{csrfToken,email:"admin@ambar-rojo.local.test",password:"AR-Prueba-2026",orgSlug:"ambar-rojo",json:"true",callbackUrl:base+"/servidores"}});
  const sesion = await (await context.request.get("/api/auth/session")).json();
  assert.equal(sesion.user.orgId,"1");
  const servidores = await tenant(tx=>tx.servidor.findMany({orderBy:{nombre:"asc"}}));
  assert.equal(servidores.length,4);
  // Fixtures exclusivamente locales; el seed nunca genera reportes.
  await tenant(async tx => {
    for(const [i,s] of servidores.entries()) {
      if(i===3) continue;
      for(let h=23;h>=0;h--) {
        const reporte = await tx.heartbeatServidor.create({data:{servidorId:s.id,fecha:new Date(Date.now()-h*3600000),ramPct:[91,78,85][i]-h/10,cpuPct:12+i*8,discoPct:35+i*10,ramTotalMb:8192,uptimeHoras:120-h}});
        idsReportes.push(reporte.id);
      }
    }
    cobroOriginal = await tx.cobro.findFirstOrThrow({where:{estado:"pagado",contrato:{contacto:{nombre:"Villafuerte y Asociados"}}}});
    await tx.cobro.update({where:{id:cobroOriginal.id},data:{estado:"vencido",montoPagado:"100",vence:new Date(Date.now()-20*86400000)}});
  });
  for(const ancho of [375,1440]) {
    await page.setViewportSize({width:ancho,height:ancho===375?900:1000});
    for(const ruta of ["servidores","panel-ar"]) {
      await page.goto(`/${ruta}`,{waitUntil:"networkidle"});
      await page.getByRole("heading",{name:ruta==="servidores"?"Servidores":"Panel Ámbar Rojo",exact:true}).waitFor();
      const medida = await page.evaluate(()=>({viewport:innerWidth,documento:document.documentElement.scrollWidth,contenido:document.querySelector("main")?.scrollWidth,anchoContenido:document.querySelector("main")?.clientWidth}));
      assert.ok(medida.documento<=medida.viewport,`${ruta} desborda en ${ancho}`);
      assert.ok(medida.contenido<=medida.anchoContenido,`${ruta}: el contenido desborda en ${ancho}`);
      medidas.push({ruta,ancho,...medida});
      if(ruta==="panel-ar") await page.getByRole("region",{name:"Alertas de la plataforma"}).waitFor();
      await page.screenshot({path:fileURLToPath(new URL(`${ruta}-${ancho}.png`,destino)),fullPage:true});
    }
    await page.goto("/servidores",{waitUntil:"networkidle"});
    await page.getByRole("button",{name:"Nuevo servidor",exact:true}).click();
    const modal=page.getByRole("dialog",{name:"Nuevo servidor",exact:true});
    await modal.waitFor();
    await page.waitForTimeout(350);
    assert.ok(await modal.locator("input").first().isVisible());
    await page.screenshot({path:fileURLToPath(new URL(`servidor-formulario-${ancho}.png`,destino))});
    await page.keyboard.press("Escape");
  }
  await page.goto("/demo",{waitUntil:"networkidle"});
  await page.getByRole("button",{name:"Cerrar recorrido"}).click();
  // La demo fiel usa su API simulada: comprobar menú y Ctrl+K reales.
  assert.equal(await page.getByRole("link",{name:"Servidores",exact:true}).count(),0);
  await page.keyboard.press("Control+k");
  const paleta = page.getByRole("dialog",{name:"Paleta de comandos"});
  await paleta.waitFor();
  await paleta.locator("input").fill("servidores");
  await page.waitForTimeout(500);
  assert.equal(await paleta.getByRole("button",{name:"Servidores",exact:true}).count(),0);
  await page.screenshot({path:fileURLToPath(new URL("demo-ctrl-k-1440.png",destino))});
  assert.deepEqual(errores,[]);
  console.log(JSON.stringify({medidas,errores,demo:"Menú y Ctrl+K sin Servidores",fixtures:"Reportes y cobro parcial simulados únicamente en crm_servidores; se eliminan al terminar"},null,2));
  await writeFile(new URL("visual.json",import.meta.url),JSON.stringify({medidas,errores},null,2));
} finally {
  await tenant(async tx => {
    await tx.heartbeatServidor.deleteMany({where:{id:{in:idsReportes}}});
    if(cobroOriginal) await tx.cobro.update({where:{id:cobroOriginal.id},data:{estado:cobroOriginal.estado,montoPagado:cobroOriginal.montoPagado,vence:cobroOriginal.vence}});
  });
  await browser.close(); await prisma.$disconnect();
}
