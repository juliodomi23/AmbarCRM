import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { encode } from "next-auth/jwt";
import { Prisma } from "@prisma/client";
import { db, dbRaw, runWithOrg } from "../src/lib/db";
import { moduloPorClave } from "../src/lib/modulos-catalogo";
import { requireModuloActivo } from "../src/lib/modulos";
import { ajustarExistenciasTaller, ErrorStockTaller } from "../src/lib/taller-inventario";
import { calcularTotalTaller, puedeEntregarConSaldo, transicionTallerValida } from "../src/lib/taller-reglas";
import { transaccionTenant } from "../src/lib/retail-db";

const appUrl = process.env.DATABASE_URL, adminUrl = process.env.ADMIN_DATABASE_URL, httpUrl = process.env.APP_URL;
for (const [label, value, dbName] of [["DATABASE_URL", appUrl, "taller_test"], ["ADMIN_DATABASE_URL", adminUrl, "postgres"]] as const) {
  if (!value) throw new Error(`Define ${label} para PostgreSQL local aislado`);
  const url = new URL(value);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== `/${dbName}`) throw new Error(`${label} solo admite localhost/${dbName}`);
}
if (!httpUrl || !["127.0.0.1", "localhost"].includes(new URL(httpUrl).hostname)) throw new Error("Define APP_URL con el servidor Next local, por ejemplo http://127.0.0.1:3011");
const adminRoot = new pg.Pool({ connectionString: adminUrl, max: 1 });
const dbUrlAdmin = new URL(adminUrl!); dbUrlAdmin.pathname = "/taller_test";
const admin = new pg.Pool({ connectionString: dbUrlAdmin.toString(), max: 1 });
const orgA = 91n, orgB = 92n;

async function prepararBase() {
  const encontrada = await adminRoot.query("SELECT 1 FROM pg_database WHERE datname='taller_test'");
  if (!encontrada.rowCount) await adminRoot.query("CREATE DATABASE taller_test");
  // actualizaciones.sql usa valores de enum nuevos en el mismo lote: pg lo corre en una transacción y falla. Con la base ya preparada con psql, se omite.
  if ((await admin.query("SELECT to_regclass('public.taller_ordenes') AS t")).rows[0].t) return;
  await admin.query(await readFile(path.resolve(process.cwd(), "..", "schema.sql"), "utf8"));
  for (const archivo of ["multi-tenant.sql", "actualizaciones.sql"]) await admin.query((await readFile(path.resolve(process.cwd(), "prisma", "sql", archivo), "utf8")).replace(/^﻿/, ""));
}

async function main() {
  await prepararBase();
  const existentes = await admin.query("SELECT id FROM orgs WHERE id IN (91,92)");
  if (existentes.rowCount) throw new Error("La base aislada debe estar vacía para esta prueba");
  await admin.query("INSERT INTO orgs (id,nombre,slug) VALUES (91,'Taller prueba','taller-prueba'),(92,'Taller otra org','taller-otra-org')");
  try {
    await runWithOrg(orgA, () => db.moduloOrg.create({ data: { clave: "taller", activo: true } }));
    const usuarioA = await runWithOrg(orgA, () => db.usuario.create({ data: { nombre: "Admin Taller Prueba", email: `taller-${Date.now()}@example.test`, passwordHash: "solo-pruebas", rol: "admin", puesto: "Administrador" } }));
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
    assert.equal(transicionTallerValida("diagnostico", "esperando_aprobacion"), false);
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

    const orden = await runWithOrg(orgA, () => db.tallerOrden.create({ data: { numero: 1n, vehiculoId: vehiculoA.id, kmEntrada: 50000, fallaReportada: "Prueba", creadoPorId: 1n } }));
    assert.equal(await runWithOrg(orgB, () => db.tallerOrden.count()), 0, "RLS oculta órdenes de otra org");
    const foto = await runWithOrg(orgA, () => db.tallerFoto.count({ where: { ordenId: orden.id } }));
    assert.equal(foto, 0);
    const httpToken = "a".repeat(48);
    const ordenHttp = await runWithOrg(orgA, () => db.tallerOrden.create({ data: { numero: 2n, vehiculoId: vehiculoA.id, kmEntrada: 50000, fallaReportada: "HTTP", creadoPorId: 1n, estado: "esperando_aprobacion", aprobacionToken: httpToken, conceptos: { create: [{ tipo: "mano_obra", descripcion: "Diagnóstico", cantidad: new Prisma.Decimal(1), precioUnitario: new Prisma.Decimal(100) }] }, total: new Prisma.Decimal(100) } }));
    const signed = await encode({ secret: process.env.NEXTAUTH_SECRET!, maxAge: 3600, token: { id: String(usuarioA.id), sub: String(usuarioA.id), orgId: String(orgA), rol: "admin", puesto: "Administrador", checkedAt: Date.now() } });
    const base = new URL(httpUrl!);
    const request = (route: string, init?: RequestInit) => fetch(new URL(route, base), { ...init, redirect: "manual" });
    const patchOrden = (version: number, data: Record<string, unknown>) => request(`/api/taller/ordenes/${ordenHttp.id}`, { method: "PATCH", headers: { Cookie: `next-auth.session-token=${signed}`, "Content-Type": "application/json" }, body: JSON.stringify({ version, ...data }) });
    const publicPath = `/api/taller-aprobacion/${orgA}-${httpToken}`;
    const page = await request(`/taller-aprobacion/${orgA}-${httpToken}`);
    assert.equal(page.status, 200, "la página pública no debe redirigir a login");
    const publicGet = await request(publicPath);
    assert.equal(publicGet.status, 200);
    const publico = await publicGet.json();
    assert.deepEqual(Object.keys(publico.orden.conceptos[0]).sort(), ["cantidad", "descripcion", "precioUnitario"]);
    assert.equal("orgId" in publico.orden, false);
    const conceptosEnEspera = await patchOrden(1, { conceptos: [{ tipo: "mano_obra", descripcion: "Cambio prohibido", cantidad: 1, precioUnitario: 100 }] });
    assert.equal(conceptosEnEspera.status, 409);
    assert.equal((await conceptosEnEspera.json()).error, "La orden espera la respuesta del cliente. Regrésala a diagnóstico para cambiar conceptos");
    const protectedWithoutCookie = await request("/api/taller/ordenes");
    assert.ok([307, 401].includes(protectedWithoutCookie.status));
    const protectedWithCookie = () => request("/api/taller/ordenes", { headers: { Cookie: `next-auth.session-token=${signed}` } });
    assert.equal((await protectedWithCookie()).status, 200);
    const orgSinModulo = await encode({ secret: process.env.NEXTAUTH_SECRET!, maxAge: 3600, token: { id: String(usuarioA.id), sub: String(usuarioA.id), orgId: String(orgB), rol: "admin", puesto: "Administrador", checkedAt: Date.now() } });
    const apiOrgSinModulo = await request("/api/taller/ordenes", { headers: { Cookie: `next-auth.session-token=${orgSinModulo}` } });
    assert.equal(apiOrgSinModulo.status, 404, "la API del módulo apagado responde 404");
    const paginaOrgSinModulo = await request("/taller", { headers: { Cookie: `next-auth.session-token=${orgSinModulo}` } });
    // Convención del proyecto: las páginas de módulos apagados hacen redirect("/"), que Next entrega como 307 o como 200 con NEXT_REDIRECT.
    const cuerpoSinModulo = paginaOrgSinModulo.status === 200 ? await paginaOrgSinModulo.text() : "";
    assert.ok(paginaOrgSinModulo.status === 307 || cuerpoSinModulo.includes("NEXT_REDIRECT"), "la página del módulo apagado redirige a /");
    assert.equal(cuerpoSinModulo.includes("Placa"), false, "la página del módulo apagado no muestra datos de taller");
    const publicPost = () => request(publicPath, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: "aprobar" }) });
    assert.equal((await publicPost()).status, 200);
    assert.equal((await publicPost()).status, 409, "el token solo se usa una vez");
    const regresoDiagnostico = await patchOrden(2, { conceptos: [{ tipo: "mano_obra", descripcion: "Diagnóstico", cantidad: 2, precioUnitario: 100 }] });
    assert.equal(regresoDiagnostico.status, 200);
    const ordenRegresada = (await regresoDiagnostico.json()).orden;
    assert.equal(ordenRegresada.estado, "diagnostico");
    assert.equal(ordenRegresada.aprobadoAt, null);
    assert.equal(ordenRegresada.aprobadoMedio, null);
    assert.equal(ordenRegresada.aprobacionResultado, null);
    assert.equal(ordenRegresada.aprobacionToken, null);
    assert.ok(ordenRegresada.cambios.some((c: { estado: string }) => c.estado === "diagnostico"));
    assert.equal((await patchOrden(3, { estado: "esperando_aprobacion" })).status, 409);
    const diagnosticoSolo = await patchOrden(3, { diagnostico: "Revisión sin cambio de conceptos" });
    assert.equal(diagnosticoSolo.status, 200);
    assert.equal((await diagnosticoSolo.json()).orden.estado, "diagnostico");
    const ligaNueva = await request(`/api/taller/ordenes/${ordenHttp.id}/aprobacion`, { method: "POST", headers: { Cookie: `next-auth.session-token=${signed}`, "Content-Type": "application/json" }, body: JSON.stringify({ version: 4 }) });
    assert.equal(ligaNueva.status, 200);
    const urlNueva = new URL((await ligaNueva.json()).url);
    const tokenNuevo = urlNueva.pathname.split("/").pop()!;
    assert.equal((await request(`/api/taller-aprobacion/${tokenNuevo}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: "aprobar" }) })).status, 200);
    const diagnosticoNoCambiaConceptos = await patchOrden(6, { diagnostico: "Ajuste de texto" });
    assert.equal(diagnosticoNoCambiaConceptos.status, 200);
    const sigueReparacion = (await diagnosticoNoCambiaConceptos.json()).orden;
    assert.equal(sigueReparacion.estado, "en_reparacion");
    assert.ok(sigueReparacion.aprobadoAt);
    const entregaConSaldo = await runWithOrg(orgA, () => db.tallerOrden.create({ data: { numero: 3n, vehiculoId: vehiculoA.id, kmEntrada: 50000, fallaReportada: "Entrega", creadoPorId: 1n, estado: "listo", total: new Prisma.Decimal(200) } }));
    const entregada = await runWithOrg(orgA, () => db.tallerOrden.create({ data: { numero: 4n, vehiculoId: vehiculoA.id, kmEntrada: 50000, fallaReportada: "Pago posterior", creadoPorId: 1n, estado: "entregado", total: new Prisma.Decimal(200) } }));
    const conPagoCancelada = await runWithOrg(orgA, () => db.tallerOrden.create({ data: { numero: 5n, vehiculoId: vehiculoA.id, kmEntrada: 50000, fallaReportada: "Cancelación", creadoPorId: 1n, estado: "recibido", total: new Prisma.Decimal(200) } }));
    const pendienteVolver = await runWithOrg(orgA, () => db.tallerOrden.create({ data: { numero: 7n, vehiculoId: vehiculoA.id, kmEntrada: 50000, fallaReportada: "Reabrir aprobación", creadoPorId: 1n, estado: "esperando_aprobacion", aprobacionToken: "b".repeat(48) } }));
    const pendienteCancelar = await runWithOrg(orgA, () => db.tallerOrden.create({ data: { numero: 8n, vehiculoId: vehiculoA.id, kmEntrada: 50000, fallaReportada: "Cancelar aprobación", creadoPorId: 1n, estado: "esperando_aprobacion", aprobacionToken: "c".repeat(48) } }));
    const postPago = (ordenId: bigint, monto: number) => request(`/api/taller/ordenes/${ordenId}/pagos`, { method: "POST", headers: { Cookie: `next-auth.session-token=${signed}`, "Content-Type": "application/json" }, body: JSON.stringify({ monto, metodo: "efectivo" }) });
    const pagoEntregada = await postPago(entregada.id, 50);
    assert.equal(pagoEntregada.status, 201);
    assert.equal((await postPago(entregada.id, 151)).status, 409);
    const ordenCancelada = await runWithOrg(orgA, () => db.tallerOrden.create({ data: { numero: 6n, vehiculoId: vehiculoA.id, kmEntrada: 50000, fallaReportada: "Pago cerrado", creadoPorId: 1n, estado: "cancelado", total: new Prisma.Decimal(200) } }));
    assert.equal((await postPago(ordenCancelada.id, 1)).status, 409);
    const agente = await encode({ secret: process.env.NEXTAUTH_SECRET!, maxAge: 3600, token: { id: String(usuarioA.id), sub: String(usuarioA.id), orgId: String(orgA), rol: "agente", puesto: "Recepcionista", checkedAt: Date.now() } });
    const patchConSesion = (sesion: string, ordenId: bigint, data: Record<string, unknown>) => request(`/api/taller/ordenes/${ordenId}`, { method: "PATCH", headers: { Cookie: `next-auth.session-token=${sesion}`, "Content-Type": "application/json" }, body: JSON.stringify({ version: 1, ...data }) });
    const vuelveDiagnostico = await patchConSesion(signed, pendienteVolver.id, { estado: "diagnostico" });
    assert.equal(vuelveDiagnostico.status, 200);
    assert.equal((await vuelveDiagnostico.json()).orden.aprobacionToken, null);
    const cancelaPendiente = await patchConSesion(signed, pendienteCancelar.id, { estado: "cancelado" });
    assert.equal(cancelaPendiente.status, 200);
    assert.equal((await cancelaPendiente.json()).orden.aprobacionToken, null);
    assert.equal((await patchConSesion(agente, entregaConSaldo.id, { estado: "entregado" })).status, 409);
    assert.equal((await patchConSesion(signed, entregaConSaldo.id, { estado: "entregado" })).status, 409);
    assert.equal((await patchConSesion(signed, entregaConSaldo.id, { estado: "entregado", confirmarSaldoPendiente: true })).status, 200);
    assert.equal((await postPago(entregaConSaldo.id, 50)).status, 201);
    const pagoCancelacion = await postPago(conPagoCancelada.id, 50);
    assert.equal(pagoCancelacion.status, 201);
    const totalMenor = await patchConSesion(signed, conPagoCancelada.id, { conceptos: [{ tipo: "mano_obra", descripcion: "Importe reducido", cantidad: 1, precioUnitario: 20 }] });
    assert.equal(totalMenor.status, 409);
    assert.equal((await totalMenor.json()).error, "El total no puede ser menor a lo pagado");
    assert.equal((await patchConSesion(signed, conPagoCancelada.id, { estado: "cancelado" })).status, 409);
    assert.equal((await patchConSesion(signed, conPagoCancelada.id, { estado: "cancelado", confirmarCancelacionConPagos: true })).status, 200);
    const pagosTrasCancelar = await request(`/api/taller/ordenes/${conPagoCancelada.id}/pagos`, { headers: { Cookie: `next-auth.session-token=${signed}` } });
    assert.equal(pagosTrasCancelar.status, 200);
    assert.equal((await pagosTrasCancelar.json()).pagos.length, 1, "los pagos siguen visibles tras cancelar");
    assert.equal((await request("/api/taller-aprobacion/invalido")).status, 404);
    assert.equal((await request(`/api/taller-aprobacion/${orgB}-${httpToken}`)).status, 404);
    assert.equal((await request(`/api/taller-aprobacion/${orgB}-${httpToken}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: "aprobar" }) })).status, 404);
    assert.ok(ordenHttp.id);
    await admin.query("INSERT INTO taller_folios(org_id,ultimo_numero) VALUES (91,8) ON CONFLICT (org_id) DO UPDATE SET ultimo_numero=8");
    const crearOrden = (sesion: string, vehiculoId: bigint) => request("/api/taller/ordenes", { method: "POST", headers: { Cookie: `next-auth.session-token=${sesion}`, "Content-Type": "application/json" }, body: JSON.stringify({ vehiculoId: String(vehiculoId), kmEntrada: 50000, fallaReportada: "Folio concurrente", conceptos: [] }) });
    const foliosConcurrentes = await Promise.all([crearOrden(signed, vehiculoA.id), crearOrden(signed, vehiculoA.id)]);
    assert.deepEqual(foliosConcurrentes.map((r) => r.status), [201, 201]);
    const numeros = (await Promise.all(foliosConcurrentes.map(async (r) => String((await r.json()).orden.numero)))).sort((a, b) => Number(a) - Number(b));
    assert.equal(Number(numeros[1]) - Number(numeros[0]), 1, "folios concurrentes consecutivos por organización");
    await runWithOrg(orgB, () => db.moduloOrg.create({ data: { clave: "taller", activo: true } }));
    const folioOtraOrg = await crearOrden(orgSinModulo, vehiculoB.id);
    assert.equal(folioOtraOrg.status, 201);
    assert.equal(String((await folioOtraOrg.json()).orden.numero), "1", "cada organización comienza su propia secuencia");
    console.log("taller: módulo apagado, aislamiento, placa por org, versión, total, estados, concurrencia/inventario y aprobación HTTP pública OK");
  } finally {
    // Varias FKs a orgs no tienen cascade: se borran las filas de fixture de cada tabla con org_id sin disparar FKs (base aislada, rol superusuario).
    await admin.query(`SET session_replication_role = replica;
      DO $$ DECLARE t TEXT; BEGIN
        FOR t IN SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'org_id' LOOP
          EXECUTE format('DELETE FROM %I WHERE org_id IN (91,92)', t);
        END LOOP;
        DELETE FROM orgs WHERE id IN (91,92);
      END $$;
      SET session_replication_role = origin;`);
  }
}

try { await main(); }
finally { await admin.end(); await adminRoot.end(); await dbRaw.$disconnect(); }
