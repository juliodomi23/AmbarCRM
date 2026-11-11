import assert from "node:assert/strict";
import { db, dbRaw, runWithOrg } from "../src/lib/db";
import { moduloPorClave } from "../src/lib/modulos-catalogo";
import { requireModuloActivo } from "../src/lib/modulos";
import {
  esAreaAuditoria,
  esColorAuditoria,
  mesDesplazado,
  mesISO,
  nombreArea,
  normalizarPeriodo,
  puedeGestionarAuditoria,
  rangoMesAuditoria,
  resumenSemaforo,
} from "../src/lib/auditoria";

const noviembre = normalizarPeriodo("2026-11");
assert.ok(noviembre, "un mes válido se normaliza");
assert.equal(mesISO(noviembre), "2026-11");
assert.equal(noviembre.getUTCDate(), 1, "el periodo se guarda en el primer día del mes");
assert.equal(mesISO(normalizarPeriodo("2026-11-30")!), "2026-11", "una fecha completa se normaliza al mes");
assert.equal(normalizarPeriodo("2026-13"), null, "un mes fuera de rango no es válido");
assert.equal(normalizarPeriodo("noviembre"), null, "un texto libre no es un periodo");
assert.deepEqual(rangoMesAuditoria("2026-12")?.inicio, new Date(Date.UTC(2026, 11, 1, 12)));
assert.deepEqual(rangoMesAuditoria("2026-12")?.fin, new Date(Date.UTC(2027, 0, 1, 12)));
assert.equal(mesISO(mesDesplazado(noviembre, -1)), "2026-10", "se puede retroceder un mes");
assert.equal(mesISO(mesDesplazado(noviembre, 2)), "2027-01", "se puede avanzar de año");
assert.equal(esColorAuditoria("gris_na"), true, "gris es un color válido");
assert.equal(esColorAuditoria("gris"), false, "gris no es rojo");
assert.equal(esAreaAuditoria("adquisicion"), true);
assert.equal(esAreaAuditoria("ventas"), false);
assert.equal(nombreArea("marketing"), "Marketing");
assert.equal(puedeGestionarAuditoria("Gerente general", "agente"), true, "gerencia captura auditorías");
assert.equal(puedeGestionarAuditoria("Contador", "agente"), false, "un colaborador no captura auditorías");
assert.equal(puedeGestionarAuditoria(undefined, "admin"), true, "el rol admin siempre puede");
assert.deepEqual(resumenSemaforo(["verde", "rojo", "verde", "gris_na"]), { verde: 2, amarillo: 0, rojo: 1, gris_na: 1 });

async function comprobarBase() {
  if (process.env.CHECK_DB !== "1") {
    console.log("auditoria: pruebas de base omitidas (define CHECK_DB=1 para ejecutarlas)");
    return;
  }
  const orgA = 95n, orgB = 96n;
  const existentes = await dbRaw.org.findMany({ where: { id: { in: [orgA, orgB] } } });
  if (existentes.length) throw new Error("La base de prueba de auditoría debe estar vacía");
  await dbRaw.org.createMany({
    data: [
      { id: orgA, nombre: "Auditoría A", slug: `auditoria-a-${Date.now()}` },
      { id: orgB, nombre: "Auditoría B", slug: `auditoria-b-${Date.now()}` },
    ],
  });
  try {
    await runWithOrg(orgA, () => db.moduloOrg.create({ data: { clave: "auditoria", activo: true } }));
    assert.equal(moduloPorClave("auditoria")?.soloOrgId, undefined, "Auditoría es activable por cualquier organización");
    assert.equal(await runWithOrg(orgA, () => requireModuloActivo("auditoria", { rol: "admin" })), null);
    assert.equal((await runWithOrg(orgB, () => requireModuloActivo("auditoria", { rol: "admin" })))?.status, 404, "sin módulo la API responde 404");

    const adminA = await runWithOrg(orgA, () =>
      db.usuario.create({ data: { nombre: "Admin Auditoría A", email: `admin-a-${Date.now()}@test.local`, passwordHash: "x", rol: "admin", puesto: "Director general" } }),
    );
    const colaboradorA = await runWithOrg(orgA, () =>
      db.usuario.create({ data: { nombre: "Colaborador A", email: `colaborador-a-${Date.now()}@test.local`, passwordHash: "x", puesto: "Contador" } }),
    );
    const adminB = await runWithOrg(orgB, () =>
      db.usuario.create({ data: { nombre: "Admin Auditoría B", email: `admin-b-${Date.now()}@test.local`, passwordHash: "x", rol: "admin", puesto: "Director general" } }),
    );

    const periodo = new Date(Date.UTC(2026, 10, 1, 12));
    const evaluacion = await runWithOrg(orgA, () =>
      db.auditoriaEvaluacion.create({
        data: { colaboradorId: colaboradorA.id, evaluadorId: adminA.id, area: "contabilidad", periodo, color: "verde", nota: "Sin observaciones" },
      }),
    );
    assert.equal(await runWithOrg(orgB, () => db.auditoriaEvaluacion.count()), 0, "RLS oculta evaluaciones de otra org");
    assert.equal(
      await runWithOrg(orgB, () => db.auditoriaEvaluacion.updateMany({ where: { id: evaluacion.id }, data: { color: "rojo" } })).then((r) => r.count),
      0,
      "RLS impide modificar evaluaciones de otra org",
    );
    assert.equal(
      await runWithOrg(orgB, () => db.auditoriaEvaluacion.deleteMany({ where: { id: evaluacion.id } })).then((r) => r.count),
      0,
      "RLS impide borrar evaluaciones de otra org",
    );

    const otraOrg = await runWithOrg(orgA, () =>
      db.auditoriaEvaluacion
        .create({ data: { colaboradorId: adminB.id, evaluadorId: adminA.id, area: "contabilidad", periodo, color: "rojo" } })
        .then(() => "creada")
        .catch(() => "rechazada"),
    );
    assert.equal(otraOrg, "rechazada", "el colaborador debe pertenecer a la misma org");

    const duplicada = await runWithOrg(orgA, () =>
      db.auditoriaEvaluacion
        .create({ data: { colaboradorId: colaboradorA.id, evaluadorId: adminA.id, area: "contabilidad", periodo, color: "amarillo" } })
        .then(() => "creada")
        .catch(() => "rechazada"),
    );
    assert.equal(duplicada, "rechazada", "no puede haber dos evaluaciones del mismo colaborador, área y periodo");

    const actualizada = await runWithOrg(orgA, () =>
      db.auditoriaEvaluacion.update({ where: { id: evaluacion.id }, data: { color: "amarillo", nota: "Se solicitaron correcciones" } }),
    );
    assert.equal(actualizada.color, "amarillo");
    assert.equal(await runWithOrg(orgA, () => db.auditoriaEvaluacion.count()), 1, "actualizar no duplica el histórico");

    console.log("auditoria: reglas puras y base OK");
  } finally {
    for (const org of [orgA, orgB]) {
      await runWithOrg(org, async () => {
        await db.auditoriaEvaluacionCambio.deleteMany({});
        await db.auditoriaEvaluacion.deleteMany({});
        await db.usuario.deleteMany({});
        await db.moduloOrg.deleteMany({});
      });
    }
    await dbRaw.org.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  }
}

await comprobarBase();
