import assert from "node:assert/strict";
import { db, dbRaw, runWithOrg } from "../src/lib/db";
import { moduloPorClave } from "../src/lib/modulos-catalogo";
import { requireModuloActivo } from "../src/lib/modulos";
import {
  agruparAvance,
  estaAtrasada,
  fechaLimiteDe,
  periodosDelMes,
  periodoDe,
  porcentajeAvance,
  puedeGestionarDespacho,
  puedeTocarActividad,
  transicionDespachoValida,
} from "../src/lib/despacho";

assert.equal(porcentajeAvance([]), null, "sin actividades no hay avance");
assert.equal(porcentajeAvance([{ estado: "completada" }, { estado: "pendiente" }]), 50, "dos actividades dejan 50%");
assert.equal(porcentajeAvance([{ estado: "completada" }, { estado: "completada" }, { estado: "pendiente" }]), 67, "el avance se redondea");
assert.deepEqual(agruparAvance([{ estado: "completada", g: "b" }, { estado: "pendiente", g: "a" }, { estado: "completada", g: "a" }], (a) => a.g).map((g) => g.clave), ["a", "b"], "los grupos se ordenan por clave");
assert.equal(estaAtrasada({ estado: "completada", fechaLimite: "2020-01-01" }, new Date("2026-01-01T00:00:00Z")), false, "una actividad completada no se marca atrasada");
assert.equal(estaAtrasada({ estado: "pendiente", fechaLimite: "2020-01-01" }, new Date("2026-01-01T00:00:00Z")), true, "una pendiente con fecha pasada está atrasada");
assert.equal(transicionDespachoValida("bloqueada", "completada"), false, "bloqueada no salta a completada");
assert.equal(transicionDespachoValida("pendiente", "completada"), true, "pendiente puede completarse");
assert.equal(transicionDespachoValida("pendiente", "inventado"), false, "un estado desconocido no es válido");
assert.equal(puedeGestionarDespacho("Contador", "agente"), false, "un contador no gestiona el despacho");
assert.equal(puedeGestionarDespacho("Gerente general", "agente"), true, "gerencia sí gestiona");
assert.equal(puedeTocarActividad({ responsableId: 5n }, 5n, "Contador", "agente"), true, "el contador toca su actividad");
assert.equal(puedeTocarActividad({ responsableId: 5n }, 6n, "Contador", "agente"), false, "el contador no toca actividades ajenas");
assert.equal(periodoDe("2026-11-09", "semanal"), "2026-11-09", "la semana inicia en lunes");
assert.equal(periodoDe("2026-11-30", "trimestral"), "2026-10-01", "el trimestre inicia en octubre");
assert.deepEqual(periodosDelMes("2026-11", "semanal"), ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"], "noviembre de 2026 tiene cinco lunes");
assert.equal(fechaLimiteDe("2026-02", 31, "mensual"), "2026-02-28", "el día 31 se ajusta al último día del mes");
assert.equal(fechaLimiteDe("2026-11-02", 5, "semanal"), "2026-11-06", "en semanal el límite es el día de la semana");

async function comprobarBase() {
  if (process.env.CHECK_DB !== "1") {
    console.log("despacho: pruebas de base omitidas (define CHECK_DB=1 para ejecutarlas)");
    return;
  }
  const orgA = 93n, orgB = 94n;
  const existentes = await dbRaw.org.findMany({ where: { id: { in: [orgA, orgB] } } });
  if (existentes.length) throw new Error("La base de prueba de despacho debe estar vacía");
  await dbRaw.org.createMany({ data: [{ id: orgA, nombre: "Despacho A", slug: `despacho-a-${Date.now()}` }, { id: orgB, nombre: "Despacho B", slug: `despacho-b-${Date.now()}` }] });
  try {
    await runWithOrg(orgA, () => db.moduloOrg.create({ data: { clave: "despacho", activo: true } }));
    assert.equal(moduloPorClave("despacho")?.soloOrgId, undefined, "Despacho es activable por cualquier organización");
    assert.equal(await runWithOrg(orgA, () => requireModuloActivo("despacho", { rol: "admin" })), null);
    assert.equal((await runWithOrg(orgB, () => requireModuloActivo("despacho", { rol: "admin" })))?.status, 404, "sin módulo la API responde 404");

    const contacto = await runWithOrg(orgA, () => db.contacto.create({ data: { nombre: "Cliente Despacho", fuente: "manual" } }));
    const cliente = await runWithOrg(orgA, () => db.despachoCliente.create({ data: { contactoId: contacto.id } }));
    await assert.rejects(() => runWithOrg(orgA, () => db.despachoCliente.create({ data: { contactoId: contacto.id } })), "un contacto no puede ser cliente dos veces en la misma org");
    assert.equal(await runWithOrg(orgB, () => db.despachoCliente.count()), 0, "RLS oculta clientes de otra org");

    const proceso = await runWithOrg(orgA, () => db.despachoProceso.create({ data: { nombre: "Nómina", periodicidad: "mensual", actividades: { create: [{ nombre: "Calcular", diaLimite: 5 }] } }, include: { actividades: true } }));
    const actividad = await runWithOrg(orgA, () => db.despachoActividad.create({ data: { clienteId: cliente.id, plantillaActividadId: proceso.actividades[0].id, tipo: "fija", titulo: "Calcular", periodo: new Date("2026-11-01"), fechaLimite: new Date("2026-11-05") } }));
    assert.equal(await runWithOrg(orgB, () => db.despachoActividad.count()), 0, "RLS oculta actividades de otra org");
    const bloqueada = await runWithOrg(orgA, () => db.despachoActividad.update({ where: { id: actividad.id }, data: { estado: "bloqueada", version: { increment: 1 } } }));
    assert.equal(bloqueada.estado, "bloqueada");
    const vieja = await runWithOrg(orgA, () => db.despachoActividad.updateMany({ where: { id: actividad.id, version: 1 }, data: { titulo: "Cambio viejo" } }));
    assert.equal(vieja.count, 0, "una versión anterior no puede editar la actividad");
    console.log("despacho: reglas puras y base OK");
  } finally {
    for (const org of [orgA, orgB]) {
      await runWithOrg(org, async () => {
        await db.despachoActividadCambio.deleteMany({});
        await db.despachoActividad.deleteMany({});
        await db.despachoClienteProceso.deleteMany({});
        await db.despachoProcesoActividad.deleteMany({});
        await db.despachoProceso.deleteMany({});
        await db.despachoCliente.deleteMany({});
        await db.contacto.deleteMany({});
        await db.moduloOrg.deleteMany({});
      });
    }
    await dbRaw.org.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  }
}

await comprobarBase();
