import assert from "node:assert/strict";
import pg from "pg";
import ExcelJS from "exceljs";
import { parseCSV } from "../src/lib/csv";
import { esBajaCampana, horarioPermitido, validarCalendario, validarFilasCampana } from "../src/lib/campanas-envio";
import { fechaEnZona } from "../src/lib/campanas-envio-fecha";
import { clasificar, procesarCampana } from "../src/lib/campanas-envio-motor";
import { db, dbRaw, runWithOrg } from "../src/lib/db";
import { ingestarEntrante } from "../src/lib/services/ingest";
import { requireModuloActivo } from "../src/lib/modulos";
import { POST as cron } from "../src/app/api/cron/campanas-envio/route";
import { NextRequest } from "next/server";

const appUrl = process.env.DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
for (const valor of [appUrl, adminUrl]) {
  if (!valor) throw new Error("Define DATABASE_URL y ADMIN_DATABASE_URL para PostgreSQL aislado");
  const url = new URL(valor);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/campanas_test") throw new Error("La prueba solo admite localhost/campanas_test");
}
const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
const orgId = 12n, otraOrgId = 13n;
const ahoraPrueba = new Date("2026-10-19T16:00:00Z");
const plantilla = { name: "exi_aviso", language: "es_MX", status: "APPROVED" };
const respuestas = new Map<string, number>();
const llamadas: string[] = [];
const fetchOriginal = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (!url.startsWith("https://graph.facebook.com/")) throw new Error(`Red externa bloqueada en pruebas: ${url}`);
  if (url.includes("/message_templates")) return Response.json({ data: [plantilla] });
  if (url.endsWith("/messages")) {
    const body = JSON.parse(String(init?.body ?? "{}"));
    const telefono = String(body.to);
    llamadas.push(telefono);
    const codigo = respuestas.get(telefono);
    if (codigo) return Response.json({ error: { code: codigo, message: `Simulado ${codigo}` } }, { status: 400 });
    return Response.json({ messages: [{ id: `sim-${llamadas.length}` }] });
  }
  throw new Error(`Ruta Graph inesperada: ${url}`);
};

async function crearCampana(nombre: string, canalId: bigint, contactoIds: bigint[], opciones: { topeDiario?: number; tandaTamano?: number; diasSemana?: number[]; horaInicio?: string; horaFin?: string } = {}) {
  const campana = await db.campanaEnvio.create({ data: {
    nombre, canalId, plantillaNombre: plantilla.name, plantillaIdioma: plantilla.language,
    mapeoVariables: [], estado: "en_curso", confirmoPermiso: true, permisoAt: new Date(),
    fechaInicio: new Date("2026-10-01T00:00:00Z"), zonaHoraria: "America/Mexico_City",
    diasSemana: opciones.diasSemana ?? [1, 2, 3, 4, 5], horaInicio: opciones.horaInicio ?? "09:30", horaFin: opciones.horaFin ?? "17:30",
    topeDiario: opciones.topeDiario ?? 50, tandaTamano: opciones.tandaTamano ?? 5, pausaTandaMin: 5,
  } });
  for (const contactoId of contactoIds) {
    const contacto = await db.contacto.findUniqueOrThrow({ where: { id: contactoId } });
    await db.campanaDestinatario.create({ data: { campanaId: campana.id, contactoId, telefono: contacto.telefono!, variables: {} } });
  }
  return campana;
}

async function main() {
  const existentes = await admin.query("SELECT id FROM orgs WHERE id IN (12,13)");
  if (existentes.rowCount) throw new Error("La base aislada debe estar vacía para esta prueba");
  await admin.query("INSERT INTO orgs (id,nombre,slug) VALUES (12,'EXI prueba','exi-chiapas'),(13,'Otra prueba','otra-prueba')");
  await runWithOrg(orgId, async () => {
    await db.moduloOrg.create({ data: { clave: "campanas_envio", activo: true } });
  });
  const canal = await runWithOrg(orgId, () => db.canalWhatsapp.create({ data: { nombre: "Meta simulado", proveedor: "cloud_api", estado: "conectado", activo: true, config: { token: "solo-prueba", phoneNumberId: "sim-phone", wabaId: "sim-waba" } } }));
  const contactos = await runWithOrg(orgId, async () => {
    const salida = [];
    for (let i = 0; i < 20; i++) salida.push(await db.contacto.create({ data: { nombre: `Persona ${i}`, telefono: `529611000${String(i).padStart(3, "0")}`, fuente: "manual" } }));
    return salida;
  });

  assert.deepEqual(parseCSV('telefono,nombre\n"961,0000000",Ana\n'), [["telefono", "nombre"], ["961,0000000", "Ana"]]);
  const libro = new ExcelJS.Workbook();
  libro.addWorksheet("Clientes").addRows([["telefono", "nombre"], ["9610000000", "Ana"]]);
  libro.addWorksheet("Ignorada").addRow(["999"]);
  const leido = new ExcelJS.Workbook();
  await leido.xlsx.load(await libro.xlsx.writeBuffer());
  assert.equal(leido.worksheets[0].getRow(2).getCell(1).text, "9610000000");
  assert.equal(leido.worksheets.length, 2);
  await runWithOrg(orgId, async () => {
    await db.contacto.update({ where: { id: contactos[0].id }, data: { optOutDifusion: true } });
    const vista = await validarFilasCampana([["telefono", "nombre"], ["9611000000", "A"], ["9611000000", "B"], ["123", "C"], ["9611000001", "D"]], { telefono: 0, nombre: 1 });
    assert.equal(vista.conteos.optOut, 1); assert.equal(vista.conteos.duplicados, 1);
    assert.equal(vista.conteos.invalidos, 1); assert.equal(vista.conteos.validos, 1);
    assert.equal(vista.muestra.length, 4);
  });
  assert.equal(horarioPermitido({ diasSemana: [1, 2, 3, 4, 5], horaInicio: "09:30", horaFin: "17:30", zonaHoraria: "America/Mexico_City", fechaInicio: new Date("2026-10-01"), ultimaTandaAt: null, pausaTandaMin: 10 }, ahoraPrueba), true);
  assert.equal(fechaEnZona("2026-10-19T10:00", "America/Mexico_City"), "2026-10-19T16:00:00.000Z");
  assert.equal(horarioPermitido({ diasSemana: [1, 2, 3, 4, 5], horaInicio: "09:30", horaFin: "17:30", zonaHoraria: "America/Mexico_City", fechaInicio: new Date("2026-10-01"), ultimaTandaAt: null, pausaTandaMin: 10 }, new Date("2026-10-18T16:00:00Z")), false);
  assert.throws(() => validarCalendario({ topeDiario: 151 }));
  assert.throws(() => validarCalendario({ tandaTamano: 21 }));
  assert.throws(() => validarCalendario({ pausaTandaMin: 4 }));
  assert.equal(esBajaCampana("texto", " nó grácias "), true);
  assert.equal(esBajaCampana("texto", "Quiero información"), false);
  for (const [codigo, estado] of [[131050, "omitido"], [131049, "omitido"], [131026, "fallido"], [131042, "fallido"], [190, "fallido"]] as const) assert.equal(clasificar({ ok: false, errorCodigo: codigo }, 0).estado, estado);
  assert.ok(clasificar({ ok: false, errorCodigo: 131042 }, 0).pausar);
  assert.ok(clasificar({ ok: false, errorCodigo: 131049 }, 0).reintentarAt);
  assert.equal(clasificar({ ok: false, errorCodigo: 131049 }, 1).reintentarAt, null);

  await runWithOrg(orgId, async () => {
    const a = await crearCampana("Tope A", canal.id, [contactos[1].id, contactos[2].id], { topeDiario: 2, tandaTamano: 2 });
    const b = await crearCampana("Tope B", canal.id, [contactos[3].id, contactos[4].id], { topeDiario: 2, tandaTamano: 2 });
    await Promise.all([procesarCampana(orgId, a.id, ahoraPrueba), procesarCampana(orgId, b.id, ahoraPrueba)]);
    const enviados = await db.campanaDestinatario.count({ where: { campanaId: { in: [a.id, b.id] }, estado: "enviado" } });
    assert.equal(enviados, 2, "dos campañas del canal comparten tope aun en paralelo");
    await db.campanaEnvio.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { estado: "completada" } });

    const c = await crearCampana("Concurrencia", canal.id, [contactos[5].id, contactos[6].id], { topeDiario: 10, tandaTamano: 2 });
    const horaSiguiente = new Date("2026-10-20T16:00:00Z");
    const antes = llamadas.length;
    await Promise.all([procesarCampana(orgId, c.id, horaSiguiente), procesarCampana(orgId, c.id, horaSiguiente)]);
    assert.equal(llamadas.length - antes, 2, "dos ejecuciones simultáneas no duplican destinatarios");
    await db.campanaEnvio.update({ where: { id: c.id }, data: { estado: "completada" } });

    const recuperada = await crearCampana("Reinicio", canal.id, [contactos[7].id], { diasSemana: [0,1,2,3,4,5,6], horaInicio: "00:00", horaFin: "23:59" });
    await db.campanaDestinatario.updateMany({ where: { campanaId: recuperada.id }, data: { estado: "enviando", enviadoAt: new Date(Date.now() - 11 * 60_000), updatedAt: new Date(Date.now() - 11 * 60_000) } });
    process.env.WA_API_KEY = "cron-prueba";
    const respuesta = await cron(new NextRequest("http://127.0.0.1/api/cron/campanas-envio", { method: "POST", headers: { "x-api-key": "cron-prueba" } }));
    assert.equal(respuesta.status, 200);
    assert.equal(await db.campanaDestinatario.count({ where: { campanaId: recuperada.id, estado: "enviado" } }), 1);
    await db.campanaEnvio.update({ where: { id: recuperada.id }, data: { estado: "completada" } });

    const casos = [[8, 131050], [9, 131049], [10, 131026], [11, 131042], [12, 190]] as const;
    for (const [indice, codigo] of casos) {
      respuestas.set(contactos[indice].telefono!, codigo);
      const prueba = await crearCampana(`Meta ${codigo}`, canal.id, [contactos[indice].id]);
      await procesarCampana(orgId, prueba.id, new Date("2026-10-21T16:00:00Z"));
      const d = await db.campanaDestinatario.findFirstOrThrow({ where: { campanaId: prueba.id } });
      assert.equal(d.errorCodigo, codigo);
      if (codigo === 131050) assert.equal((await db.contacto.findUniqueOrThrow({ where: { id: contactos[indice].id } })).optOutDifusion, true);
      if (codigo === 131049) assert.ok(d.reintentarAt && d.reintentarAt > new Date());
      if (codigo === 131042 || codigo === 190) assert.equal((await db.campanaEnvio.findUniqueOrThrow({ where: { id: prueba.id } })).estado, "pausada");
      await db.campanaEnvio.update({ where: { id: prueba.id }, data: { estado: "completada" } });
    }

    const lote = [];
    for (let i = 20; i < 40; i++) lote.push(await db.contacto.create({ data: { nombre: `Lote ${i}`, telefono: `529611000${String(i).padStart(3, "0")}`, fuente: "manual" } }));
    lote.slice(0, 7).forEach((c) => respuestas.set(c.telefono!, 131026));
    const calidad = await crearCampana("Fallas de calidad", canal.id, lote.map((c) => c.id), { topeDiario: 50, tandaTamano: 20 });
    await procesarCampana(orgId, calidad.id, new Date("2026-10-22T16:00:00Z"));
    const pausada = await db.campanaEnvio.findUniqueOrThrow({ where: { id: calidad.id } });
    assert.equal(pausada.estado, "pausada", "7 de 20 fallos detienen la campaña");
    assert.match(pausada.motivoPausa ?? "", /30 %/);

    const enviado = await db.campanaDestinatario.findFirstOrThrow({ where: { estado: "enviado", campanaId: { in: [a.id, b.id] } } });
    const antesBaja = llamadas.length;
    await ingestarEntrante({ waMessageId: "baja-prueba", telefono: enviado.telefono, tipo: "texto", contenido: "NÓ GRACIAS", direccion: "entrante", timestamp: new Date() }, canal.id);
    assert.equal((await db.contacto.findUniqueOrThrow({ where: { id: enviado.contactoId } })).optOutDifusion, true);
    assert.equal(llamadas.length, antesBaja, "la baja no genera respuesta automática");
    assert.ok(await db.mensaje.findFirst({ where: { conversacion: { contactoId: enviado.contactoId }, interna: true } }));

    const otroEnviado = await db.campanaDestinatario.findFirstOrThrow({ where: { estado: "enviado", campanaId: { in: [a.id, b.id] }, contactoId: { not: enviado.contactoId } } });
    const reciente = await validarFilasCampana([["telefono"], [otroEnviado.telefono]], { telefono: 0 });
    assert.equal(reciente.conteos.recientes, 1);
  });

  const aislado = await runWithOrg(otraOrgId, () => db.campanaEnvio.count());
  assert.equal(aislado, 0, "RLS oculta campañas de EXI a otra org");
  const bloqueado = await runWithOrg(otraOrgId, () => requireModuloActivo("campanas_envio", { rol: "admin" }));
  assert.equal(bloqueado?.status, 404);
  await runWithOrg(orgId, () => db.moduloOrg.updateMany({ where: { clave: "campanas_envio" }, data: { activo: false } }));
  const apagado = await runWithOrg(orgId, () => requireModuloActivo("campanas_envio", { rol: "admin" }));
  assert.equal(apagado?.status, 404);
  console.log("campanas-envio: CSV/XLSX, vista previa, calendario, topes, concurrencia, reinicio, códigos Meta, umbral de fallos, baja, RLS y módulo apagado OK");
}

try { await main(); }
finally { globalThis.fetch = fetchOriginal; await admin.end(); await dbRaw.$disconnect(); }
