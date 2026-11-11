import assert from "node:assert/strict";
import pg from "pg";
import { NextRequest } from "next/server";
import { db, dbRaw, runWithOrg } from "../src/lib/db";
import { POST as cron } from "../src/app/api/cron/seguimientos-pendientes/route";

const appUrl = process.env.DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
for (const valor of [appUrl, adminUrl]) {
  if (!valor) throw new Error("Define DATABASE_URL y ADMIN_DATABASE_URL para PostgreSQL aislado");
  const url = new URL(valor);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/seguimientos_test") {
    throw new Error("La prueba solo admite localhost/seguimientos_test");
  }
}
const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
const orgId = 21n, otraOrgId = 22n;

async function main() {
  const existentes = await admin.query("SELECT id FROM orgs WHERE id IN (21,22)");
  if (existentes.rowCount) throw new Error("La base aislada debe estar vacía para esta prueba");
  await admin.query(
    "INSERT INTO orgs (id,nombre,slug) VALUES (21,'Comercial prueba','comercial-prueba'),(22,'Otra prueba','otra-prueba-seg')",
  );

  process.env.WA_API_KEY = "cron-prueba-seguimientos";
  const llamarCron = () =>
    cron(new NextRequest("http://127.0.0.1/api/cron/seguimientos-pendientes", { method: "POST", headers: { "x-api-key": "cron-prueba-seguimientos" } }));

  const sinApiKey = await cron(new NextRequest("http://127.0.0.1/api/cron/seguimientos-pendientes", { method: "POST" }));
  assert.equal(sinApiKey.status, 401, "sin x-api-key no autoriza");

  const vacio = await llamarCron();
  assert.equal(vacio.status, 200);
  assert.deepEqual((await vacio.json()).empresas, [], "sin datos, ninguna empresa aparece en la respuesta");

  await runWithOrg(orgId, async () => {
    const embudo = await db.embudo.create({ data: { nombre: "Comercial Ámbar Rojo" } });
    const prospecto = await db.etapa.create({ data: { embudoId: embudo.id, nombre: "Prospecto", tipo: "normal" } });
    const ganado = await db.etapa.create({ data: { embudoId: embudo.id, nombre: "Ganado", tipo: "ganado" } });
    const contactoViejo = await db.contacto.create({ data: { nombre: "Energía Cero", telefono: "529610000001", fuente: "manual" } });
    const contactoNuevo = await db.contacto.create({ data: { nombre: "Recién llegado", telefono: "529610000002", fuente: "manual" } });
    const responsable = await db.usuario.create({ data: { nombre: "Raúl", email: "raul-seguimientos-test@example.com", passwordHash: "x" } });

    const haceCincoDias = new Date(Date.now() - 5 * 86_400_000);
    const oportunidadEstancada = await db.oportunidad.create({
      data: { titulo: "Propuesta · Energía Cero", contactoId: contactoViejo.id, embudoId: embudo.id, etapaId: prospecto.id, responsableId: responsable.id, createdAt: haceCincoDias },
    });
    await db.oportunidad.create({
      data: { titulo: "Propuesta · Recién llegado", contactoId: contactoNuevo.id, embudoId: embudo.id, etapaId: prospecto.id, responsableId: responsable.id },
    });
    const oportunidadGanada = await db.oportunidad.create({
      data: { titulo: "Cerrado · viejo", contactoId: contactoViejo.id, embudoId: embudo.id, etapaId: ganado.id, estado: "ganado", createdAt: haceCincoDias },
    });

    const haceDosDias = new Date(Date.now() - 2 * 86_400_000);
    await db.tarea.create({ data: { titulo: "Dar seguimiento", oportunidadId: oportunidadEstancada.id, responsableId: responsable.id, venceAt: haceDosDias } });
    await db.tarea.create({ data: { titulo: "Tarea de hoy", oportunidadId: oportunidadEstancada.id, responsableId: responsable.id, venceAt: new Date() } });
    await db.tarea.create({ data: { titulo: "Ya atendida", oportunidadId: oportunidadGanada.id, responsableId: responsable.id, venceAt: haceDosDias, completada: true } });

    const respuesta = await llamarCron();
    assert.equal(respuesta.status, 200);
    const cuerpo = await respuesta.json();
    assert.equal(cuerpo.empresasConError.length, 0);
    const empresa = cuerpo.empresas.find((e: { orgId: string }) => e.orgId === String(orgId));
    assert.ok(empresa, "la org con pendientes aparece en la respuesta");
    assert.equal(empresa.tareasVencidas.length, 1);
    assert.equal(empresa.tareasVencidas[0].titulo, "Dar seguimiento");
    assert.equal(empresa.tareasVencidas[0].oportunidad.contacto, "Energía Cero");
    assert.equal(empresa.tareasHoy.length, 1);
    assert.equal(empresa.tareasHoy[0].titulo, "Tarea de hoy");
    assert.equal(empresa.oportunidadesEstancadas.length, 1, "solo la oportunidad abierta de 5 días en etapa normal; la reciente y la ganada quedan fuera");
    assert.equal(empresa.oportunidadesEstancadas[0].contacto, "Energía Cero");
    assert.ok(empresa.oportunidadesEstancadas[0].diasEnEtapa >= 5);
  });

  const aislado = await runWithOrg(otraOrgId, () => db.oportunidad.count());
  assert.equal(aislado, 0, "RLS: otra org no ve las oportunidades de la primera");

  console.log("seguimientos-pendientes: auth, vacío, tareas vencidas/hoy, oportunidades estancadas, exclusión de ganadas/recientes, RLS OK");
}

try { await main(); }
finally { await admin.end(); await dbRaw.$disconnect(); }
