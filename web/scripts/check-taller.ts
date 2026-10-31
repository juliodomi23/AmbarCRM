import assert from "node:assert/strict";
import pg from "pg";
import { Prisma } from "@prisma/client";
import { db, dbRaw, runWithOrg } from "../src/lib/db";
import { moduloPorClave } from "../src/lib/modulos-catalogo";
import { requireModuloActivo } from "../src/lib/modulos";
import { ajustarExistenciasTaller, ErrorStockTaller } from "../src/lib/taller-inventario";
import { calcularTotalTaller, puedeEntregarConSaldo, transicionTallerValida } from "../src/lib/taller-reglas";
import { transaccionTenant } from "../src/lib/retail-db";

const appUrl = process.env.DATABASE_URL, adminUrl = process.env.ADMIN_DATABASE_URL;
for (const value of [appUrl, adminUrl]) {
  if (!value) throw new Error("Define DATABASE_URL y ADMIN_DATABASE_URL para PostgreSQL aislado");
  const url = new URL(value);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/taller_test") throw new Error("La prueba solo admite localhost/taller_test");
}
const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
const orgA = 91n, orgB = 92n;

async function main() {
  const existentes = await admin.query("SELECT id FROM orgs WHERE id IN (91,92)");
  if (existentes.rowCount) throw new Error("La base aislada debe estar vacía para esta prueba");
  await admin.query("INSERT INTO orgs (id,nombre,slug) VALUES (91,'Taller prueba','taller-prueba'),(92,'Taller otra org','taller-otra-org')");
  try {
    await runWithOrg(orgA, () => db.moduloOrg.create({ data: { clave: "taller", activo: true } }));
    assert.equal(moduloPorClave("taller")?.soloOrgId, undefined, "Taller es activable por cualquier organización");
    assert.equal(await runWithOrg(orgA, () => requireModuloActivo("taller", { rol: "admin" })), null);
    assert.equal((await runWithOrg(orgB, () => requireModuloActivo("taller", { rol: "admin" })))?.status, 404, "una org sin módulo recibe 404");

    const contactoA = await runWithOrg(orgA, () => db.contacto.create({ data: { nombre: "Cliente A", fuente: "manual" } }));
    const contactoB = await runWithOrg(orgB, () => db.contacto.create({ data: { nombre: "Cliente B", fuente: "manual" } }));
    const vehiculoA = await runWithOrg(orgA, () => db.tallerVehiculo.create({ data: { contactoId: contactoA.id, placa: "ABC123", vin: "VIN123ABC", marca: "Nissan", modelo: "Versa", kilometraje: 50000 } }));
    const vehiculoB = await runWithOrg(orgB, () => db.tallerVehiculo.create({ data: { contactoId: contactoB.id, placa: "ABC123", marca: "Honda", modelo: "City" } }));
    assert.ok(vehiculoB.id, "la misma placa se permite en otra organización");
    await assert.rejects(() => runWithOrg(orgA, () => db.tallerVehiculo.create({ data: { contactoId: contactoA.id, placa: "ABC123", marca: "Ford", modelo: "Fiesta" } })), "placa duplicada en la org debe fallar");
    await assert.rejects(() => runWithOrg(orgB, () => db.tallerVehiculo.create({ data: { contactoId: contactoA.id, placa: "FORANEA", marca: "Ford", modelo: "Fiesta" } })), "no se puede enlazar vehículo al contacto de otra org");
    assert.equal(await runWithOrg(orgB, () => db.tallerVehiculo.count()), 1, "RLS solo devuelve vehículos de la org actual");

    const stale = await runWithOrg(orgA, () => db.tallerVehiculo.updateMany({ where: { id: vehiculoA.id, version: 1 }, data: { version: { increment: 1 } } }));
    assert.equal(stale.count, 1);
    const staleRetry = await runWithOrg(orgA, () => db.tallerVehiculo.updateMany({ where: { id: vehiculoA.id, version: 1 }, data: { kilometraje: 90000 } }));
    assert.equal(staleRetry.count, 0, "una edición con versión anterior queda rechazada");

    assert.equal(calcularTotalTaller([{ cantidad: 2, precioUnitario: 125.5 }, { cantidad: 1.5, precioUnitario: 200 }]), 551, "el servidor deriva el total de los conceptos, no del total enviado");
    assert.equal(transicionTallerValida("recibido", "entregado"), false, "se bloquea recibido → entregado");
    assert.equal(transicionTallerValida("diagnostico", "esperando_aprobacion"), true);
    assert.equal(puedeEntregarConSaldo("agente", true, 100), false);
    assert.equal(puedeEntregarConSaldo("admin", false, 100), false);
    assert.equal(puedeEntregarConSaldo("admin", true, 100), true);

    const refaccion = await runWithOrg(orgA, () => db.tallerRefaccion.create({ data: { nombre: "Filtro", codigo: "FIL-1", existencia: 1, minimo: 1, costo: new Prisma.Decimal(50), precio: new Prisma.Decimal(100) } }));
    const consumir = () => transaccionTenant(orgA, (tx) => ajustarExistenciasTaller(tx, new Map([[String(refaccion.id), new Prisma.Decimal(1)]])));
    const concurrentes = await Promise.allSettled([consumir(), consumir()]);
    assert.equal(concurrentes.filter((r) => r.status === "fulfilled").length, 1, "dos consumos concurrentes no gastan la misma pieza");
    assert.equal(concurrentes.filter((r) => r.status === "rejected" && r.reason instanceof ErrorStockTaller).length, 1);
    const existenciaTrasDosConsumos = await runWithOrg(orgA, () => db.tallerRefaccion.findUniqueOrThrow({ where: { id: refaccion.id } }));
    assert.equal(existenciaTrasDosConsumos.existencia, 0, "la existencia nunca queda negativa");
    await transaccionTenant(orgA, (tx) => ajustarExistenciasTaller(tx, new Map([[String(refaccion.id), new Prisma.Decimal(-1)]])));
    const existenciaTrasCancelar = await runWithOrg(orgA, () => db.tallerRefaccion.findUniqueOrThrow({ where: { id: refaccion.id } }));
    assert.equal(existenciaTrasCancelar.existencia, 1, "cancelar devuelve la existencia");
    assert.equal(await runWithOrg(orgB, () => db.tallerRefaccion.count()), 0, "RLS oculta refacciones de otra org");

    const orden = await runWithOrg(orgA, () => db.tallerOrden.create({ data: { vehiculoId: vehiculoA.id, kmEntrada: 50000, fallaReportada: "Prueba", creadoPorId: 1n } }));
    assert.equal(await runWithOrg(orgB, () => db.tallerOrden.count()), 0, "RLS oculta órdenes de otra org");
    const foto = await runWithOrg(orgA, () => db.tallerFoto.count({ where: { ordenId: orden.id } }));
    assert.equal(foto, 0);
    console.log("taller: módulo apagado, aislamiento, placa por org, versión, total, estados, concurrencia/inventario, reversión y entrega con saldo OK");
  } finally {
    await admin.query("DELETE FROM orgs WHERE id IN (91,92)");
  }
}

try { await main(); }
finally { await admin.end(); await dbRaw.$disconnect(); }
