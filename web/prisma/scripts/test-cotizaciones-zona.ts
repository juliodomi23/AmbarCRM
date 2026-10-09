import assert from "node:assert/strict";
import pg from "pg";
import { Prisma } from "@prisma/client";
import { crearCotizacion, ErrorCotizacion, responderCotizacion, vencerCotizaciones } from "../../src/lib/cotizaciones-db";
import { dbRaw } from "../../src/lib/db";
import { transaccionTenant } from "../../src/lib/retail-db";

const { Pool } = pg;
const adminUrl = process.env.ADMIN_DATABASE_URL;
if (!adminUrl) throw new Error("Define ADMIN_DATABASE_URL con el usuario dueño");
const admin = new Pool({ connectionString: adminUrl, max: 1 });
const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const orgId = BigInt(Date.now()) * 1000n + 983n;

async function nueva(contactoId: bigint) {
  return crearCotizacion(orgId, null, {
    contactoId,
    oportunidadId: null,
    vigencia: new Date("2026-10-09T12:00:00.000Z"),
    descuentoGeneral: new Prisma.Decimal(0),
    convertirVenta: false,
    notas: null,
    condiciones: null,
    partidas: [{ productoId: null, concepto: "Servicio", cantidad: new Prisma.Decimal(1), precio: new Prisma.Decimal(100), descuento: new Prisma.Decimal(0) }],
  });
}

async function main() {
  await admin.query("INSERT INTO orgs (id, nombre, slug) VALUES ($1, 'Zona cotizaciones', $2)", [orgId.toString(), `zona-cot-${sufijo}`]);
  const contacto = await transaccionTenant(orgId, async (tx) => {
    await tx.moduloOrg.createMany({ data: [
      { clave: "cotizaciones", activo: true, config: { ivaPorcentaje: "16" } },
      { clave: "reservas_en_linea", activo: true, config: { zona: "America/Mexico_City" } },
    ] });
    return tx.contacto.create({ data: { nombre: "Cliente zona" } });
  });

  const vigente = await nueva(contacto.id);
  const aceptada = await responderCotizacion(orgId, vigente.tokenPublico, {
    accion: "aceptar", nombre: "Cliente", ip: "127.0.0.1", ahora: new Date("2026-10-10T02:00:00.000Z"),
  });
  assert.equal(aceptada.cotizacion.estado, "aceptada");

  const vencida = await nueva(contacto.id);
  let respuestaVencida = { status: 0, mensaje: "" };
  try {
    await responderCotizacion(orgId, vencida.tokenPublico, {
      accion: "aceptar", nombre: "Cliente", ip: "127.0.0.1", ahora: new Date("2026-10-10T06:01:00.000Z"),
    });
  } catch (error) {
    respuestaVencida = { status: error instanceof ErrorCotizacion ? error.status : 500, mensaje: error instanceof Error ? error.message : "" };
  }
  const antesCron = await transaccionTenant(orgId, (tx) => tx.cotizacion.findUniqueOrThrow({ where: { id: vencida.id } }));
  const marcadas = await vencerCotizaciones(orgId, new Date("2026-10-10T06:01:00.000Z"));
  const despuesCron = await transaccionTenant(orgId, (tx) => tx.cotizacion.findUniqueOrThrow({ where: { id: vencida.id } }));
  assert.deepEqual(respuestaVencida, { status: 409, mensaje: "La cotización está vencida" });
  assert.equal(antesCron.estado, "borrador");
  assert.equal(marcadas, 1);
  assert.equal(despuesCron.estado, "vencida");

  console.log(JSON.stringify({
    zona: "America/Mexico_City",
    ultimoDia20h: aceptada.cotizacion.estado,
    diaSiguiente0001: respuestaVencida,
    estadoTrasRollback: antesCron.estado,
    cron: { marcadas, estado: despuesCron.estado },
  }));
}

async function limpiar() {
  await admin.query("SET session_replication_role = replica");
  try {
    const tablas = await admin.query<{ table_name: string }>("SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'org_id'");
    for (const { table_name } of tablas.rows) await admin.query(`DELETE FROM "${table_name.replaceAll('"', '""')}" WHERE org_id = $1`, [orgId.toString()]);
    await admin.query("DELETE FROM orgs WHERE id = $1", [orgId.toString()]);
  } finally { await admin.query("SET session_replication_role = origin"); }
}

main().catch((error) => { console.error("FALLO:", error); process.exitCode = 1; }).finally(async () => {
  await limpiar().catch((error) => console.error("No se pudo limpiar:", error));
  await Promise.all([dbRaw.$disconnect(), admin.end()]);
});
