import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import pg from "pg";
import { apiE2E, loginE2E, paginaE2E } from "./e2e-http";

const baseUrl = process.env.E2E_BASE_URL ?? "";
const adminUrl = process.env.ADMIN_DATABASE_URL ?? "";
if (!baseUrl || !adminUrl) throw new Error("Define E2E_BASE_URL y ADMIN_DATABASE_URL locales explícitas.");
const base = new URL(baseUrl);
const baseDatos = new URL(adminUrl);
if (
  !["localhost", "127.0.0.1"].includes(base.hostname) ||
  base.port !== "3120" ||
  !["localhost", "127.0.0.1"].includes(baseDatos.hostname) ||
  !["55433", "55451"].includes(baseDatos.port)
) {
  throw new Error("Esta prueba sólo admite HTTP local :3120 y una BD desechable local :55433 o :55451.");
}

const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const orgA = BigInt(Date.now()) * 1000n + 111n;
const orgB = orgA + 1n;
const slugA = `despacho-e2e-a-${sufijo}`;
const slugB = `despacho-e2e-b-${sufijo}`;
const password = "Despacho-E2E-2026!";

type ProcesoDto = { id: string; nombre: string; periodicidad: string; actividades: { id: string; nombre: string }[] };
type ClienteDto = { id: string; version: number; contactoId: string; procesos: { id: string; procesoId: string }[] };
type ActividadDto = {
  id: string;
  version: number;
  estado: string;
  titulo: string;
  responsableId: string | null;
  clienteId: string;
  requiereConfirmacion: boolean;
  confirmadaAt: string | null;
  cambios: { estadoNuevo: string }[];
};
type MovimientoDto = { id: string; monto: string; tipo: string; unidad: string };

async function main() {
  await admin.query(
    "INSERT INTO orgs(id,nombre,slug) VALUES ($1,'Despacho E2E A',$2),($3,'Despacho E2E B',$4)",
    [String(orgA), slugA, String(orgB), slugB],
  );
  const hash = await bcrypt.hash(password, 10);
  const usuarios = [
    { org: orgA, nombre: "Admin A", email: `admin-${sufijo}@test.local`, rol: "admin", puesto: "Administrador" },
    { org: orgA, nombre: "Contador A", email: `contador-${sufijo}@test.local`, rol: "agente", puesto: "Contador" },
    { org: orgA, nombre: "Lusmi A", email: `lusmi-${sufijo}@test.local`, rol: "agente", puesto: "Auxiliar administrativo" },
    { org: orgB, nombre: "Admin B", email: `admin-b-${sufijo}@test.local`, rol: "admin", puesto: "Administrador" },
  ] as const;
  const ids = new Map<string, string>();
  const idDe = (email: string) => {
    const id = ids.get(email);
    assert.ok(id, `Falta el usuario ${email}`);
    return id;
  };
  for (const usuario of usuarios) {
    const { rows } = await admin.query(
      "INSERT INTO usuarios(org_id,nombre,email,password_hash,rol,puesto) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id::text AS id",
      [String(usuario.org), usuario.nombre, usuario.email, hash, usuario.rol, usuario.puesto],
    );
    ids.set(usuario.email, rows[0].id);
  }
  const contactoA = (
    await admin.query(
      "INSERT INTO contactos(org_id,nombre,telefono) VALUES ($1,'Cliente Despacho A',$2) RETURNING id::text AS id",
      [String(orgA), `5299${Date.now()}`],
    )
  ).rows[0].id;
  const contactoB = (
    await admin.query(
      "INSERT INTO contactos(org_id,nombre,telefono) VALUES ($1,'Cliente Despacho B',$2) RETURNING id::text AS id",
      [String(orgB), `5288${Date.now()}`],
    )
  ).rows[0].id;
  await admin.query(
    "INSERT INTO modulos_org(org_id,clave,activo,config) VALUES ($1,'despacho',true,$2::jsonb),($3,'despacho',true,'{}'::jsonb)",
    [String(orgA), JSON.stringify({ usuariosAccesoTotal: [idDe(usuarios[2].email)], usuariosConfirmadores: [idDe(usuarios[2].email)] }), String(orgB)],
  );

  const adminA = await loginE2E(baseUrl, usuarios[0].email, slugA, password);
  const contadorA = await loginE2E(baseUrl, usuarios[1].email, slugA, password);
  const lusmiA = await loginE2E(baseUrl, usuarios[2].email, slugA, password);
  const adminB = await loginE2E(baseUrl, usuarios[3].email, slugB, password);

  assert.equal((await apiE2E(baseUrl, "", "/api/despacho/procesos")).status, 307);
  assert.equal((await apiE2E(baseUrl, "", "/api/despacho/procesos", "POST", {})).status, 307);
  assert.equal((await apiE2E(baseUrl, adminA, "/api/despacho/procesos")).status, 200);
  assert.equal((await apiE2E(baseUrl, contadorA, "/api/despacho/procesos")).status, 200);
  assert.equal((await apiE2E(baseUrl, contadorA, "/api/despacho/procesos", "POST", { nombre: "Sin permiso", periodicidad: "mensual" })).status, 403);
  assert.equal((await apiE2E(baseUrl, adminA, "/api/despacho/procesos", "POST", { nombre: "Inválido", periodicidad: "diaria" })).status, 400);

  const proceso = (
    await apiE2E<{ proceso: ProcesoDto }>(baseUrl, adminA, "/api/despacho/procesos", "POST", {
      nombre: `Proceso mensual ${sufijo}`,
      periodicidad: "mensual",
      actividades: [
        { nombre: "Declaración mensual", diaLimite: 15 },
        { nombre: "Revisión de nómina", diaLimite: 20 },
      ],
    })
  ).data.proceso;
  assert.ok(proceso);
  assert.equal(proceso.actividades.length, 2);

  const cliente = (
    await apiE2E<{ cliente: ClienteDto }>(baseUrl, adminA, "/api/despacho/clientes", "POST", {
      contactoId: contactoA,
      responsableId: idDe(usuarios[0].email),
      rfc: "XAXX010101000",
    })
  ).data.cliente;
  assert.ok(cliente);
  assert.equal(cliente.version, 1);
  assert.equal((await apiE2E(baseUrl, adminA, "/api/despacho/clientes", "POST", { contactoId: contactoB })).status, 400);
  assert.equal((await apiE2E(baseUrl, adminB, "/api/despacho/clientes", "POST", { contactoId: contactoA })).status, 400);

  const clienteB = (
    await apiE2E<{ cliente: ClienteDto }>(baseUrl, adminB, "/api/despacho/clientes", "POST", {
      contactoId: contactoB,
    })
  ).data.cliente;
  assert.ok(clienteB);

  const asignado = (
    await apiE2E<{ cliente: ClienteDto }>(baseUrl, adminA, `/api/despacho/clientes/${cliente.id}`, "PATCH", {
      version: 1,
      procesos: [{ procesoId: proceso.id, responsableId: idDe(usuarios[1].email) }],
    })
  ).data.cliente;
  assert.ok(asignado);
  assert.equal(asignado.version, 2);
  assert.equal(asignado.procesos.length, 1);
  assert.equal((await apiE2E(baseUrl, adminB, `/api/despacho/clientes/${cliente.id}`)).status, 404);
  assert.equal((await apiE2E(baseUrl, adminB, `/api/despacho/clientes/${cliente.id}`, "PATCH", { version: 2, notas: "Cruce" })).status, 404);
  assert.equal((await apiE2E(baseUrl, adminA, `/api/despacho/clientes/${cliente.id}`, "PATCH", { version: 1, notas: "Versión vieja" })).status, 409);

  const generado = (
    await apiE2E<{ creadas: number; existentes: number; total: number }>(baseUrl, adminA, "/api/despacho/generar", "POST", {
      mes: "2026-11",
    })
  ).data;
  assert.equal(generado.creadas, 2);
  assert.equal(generado.total, 2);
  const repetido = (
    await apiE2E<{ creadas: number; existentes: number; total: number }>(baseUrl, adminA, "/api/despacho/generar", "POST", {
      mes: "2026-11",
    })
  ).data;
  assert.equal(repetido.creadas, 0);
  assert.equal(repetido.existentes, 2);
  assert.equal((await apiE2E(baseUrl, contadorA, "/api/despacho/generar", "POST", { mes: "2026-11" })).status, 403);
  assert.equal((await apiE2E(baseUrl, adminA, "/api/despacho/generar", "POST", { mes: "2026-13" })).status, 400);

  const listado = (await apiE2E<{ actividades: ActividadDto[] }>(baseUrl, adminA, "/api/despacho/actividades?periodo=2026-11")).data.actividades;
  assert.equal(listado.length, 2);
  assert.ok(listado.every((actividad) => actividad.clienteId === cliente.id));
  assert.ok(listado.every((actividad) => String(actividad.responsableId) === idDe(usuarios[1].email)));
  assert.equal((await apiE2E<{ actividades: ActividadDto[] }>(baseUrl, adminB, "/api/despacho/actividades")).data.actividades.length, 0);
  const extraordinaria = await apiE2E<{ actividad: ActividadDto }>(baseUrl, adminA, "/api/despacho/actividades", "POST", {
    clienteId: cliente.id, titulo: "Aclaración extraordinaria", periodo: "2026-11", fechaLimite: "2026-11-30", tipo: "extraordinaria", responsableId: idDe(usuarios[0].email),
  });
  assert.equal(extraordinaria.status, 201);
  assert.equal(extraordinaria.data.actividad.requiereConfirmacion, true);
  assert.equal((await apiE2E<{ actividades: ActividadDto[] }>(baseUrl, contadorA, "/api/despacho/actividades?periodo=2026-11")).data.actividades.length, 2);
  assert.equal((await apiE2E<{ actividades: ActividadDto[] }>(baseUrl, lusmiA, "/api/despacho/actividades?periodo=2026-11")).data.actividades.length, 3, "Lusmi ve las actividades de todos los responsables");
  const modulosLusmi = await apiE2E<{ modulos: { clave: string; activo: boolean }[] }>(baseUrl, lusmiA, "/api/modulos");
  assert.equal(modulosLusmi.data.modulos.find((modulo) => modulo.clave === "despacho")?.activo, true, "el acceso especial habilita el módulo sin rol admin global");

  const actividad = listado[0];
  assert.ok(actividad);
  assert.equal((await apiE2E(baseUrl, adminB, `/api/despacho/actividades/${actividad.id}`)).status, 404);
  assert.equal((await apiE2E(baseUrl, adminB, `/api/despacho/actividades/${actividad.id}`, "PATCH", { version: 1, estado: "en_proceso" })).status, 404);

  const enProceso = (
    await apiE2E<{ actividad: ActividadDto }>(baseUrl, contadorA, `/api/despacho/actividades/${actividad.id}`, "PATCH", {
      version: 1,
      estado: "en_proceso",
      nota: "Iniciada por el contador",
    })
  ).data.actividad;
  assert.ok(enProceso);
  assert.equal(enProceso.version, 2);
  assert.equal(enProceso.estado, "en_proceso");
  assert.equal(enProceso.cambios.at(-1)?.estadoNuevo, "en_proceso");
  assert.equal((await apiE2E(baseUrl, contadorA, `/api/despacho/actividades/${actividad.id}`, "PATCH", { version: 2, titulo: "Cambio no permitido" })).status, 403);
  assert.equal((await apiE2E(baseUrl, adminA, `/api/despacho/actividades/${actividad.id}`, "PATCH", { version: 1, estado: "completada" })).status, 409);

  const bloqueada = (
    await apiE2E<{ actividad: ActividadDto }>(baseUrl, adminA, `/api/despacho/actividades/${actividad.id}`, "PATCH", {
      version: 2,
      estado: "bloqueada",
    })
  ).data.actividad;
  assert.equal(bloqueada?.estado, "bloqueada");
  assert.equal((await apiE2E(baseUrl, adminA, `/api/despacho/actividades/${actividad.id}`, "PATCH", { version: 3, estado: "completada" })).status, 409);
  assert.equal((await apiE2E(baseUrl, adminA, `/api/despacho/actividades/${actividad.id}`, "PATCH", { version: 3, estado: "en_proceso" })).status, 200);
  assert.equal((await apiE2E(baseUrl, adminA, `/api/despacho/actividades/${actividad.id}`, "DELETE")).status, 200);
  assert.equal((await apiE2E(baseUrl, adminA, `/api/despacho/actividades/${actividad.id}`)).status, 404);

  const paraConfirmar = listado[1];
  const iniciada = await apiE2E<{ actividad: ActividadDto }>(baseUrl, contadorA, `/api/despacho/actividades/${paraConfirmar.id}`, "PATCH", { version: paraConfirmar.version, estado: "en_proceso" });
  assert.equal(iniciada.status, 200);
  const completada = await apiE2E<{ actividad: ActividadDto }>(baseUrl, contadorA, `/api/despacho/actividades/${paraConfirmar.id}`, "PATCH", { version: iniciada.data.actividad.version, estado: "completada" });
  assert.equal(completada.status, 200);
  assert.equal(completada.data.actividad.confirmadaAt, null, "completar solicita confirmación, no suma todavía");
  assert.equal((await apiE2E(baseUrl, contadorA, `/api/despacho/actividades/${paraConfirmar.id}/confirmar`, "POST", { version: completada.data.actividad.version })).status, 403);
  const confirmacion = await apiE2E<{ actividad: ActividadDto }>(baseUrl, lusmiA, `/api/despacho/actividades/${paraConfirmar.id}/confirmar`, "POST", { version: completada.data.actividad.version });
  assert.equal(confirmacion.status, 200);
  assert.ok(confirmacion.data.actividad.confirmadaAt, "Lusmi confirma sin convertirse en admin global");

  const ingreso = await apiE2E<{ movimiento: MovimientoDto }>(baseUrl, adminA, "/api/despacho/finanzas", "POST", {
    unidad: "despacho", tipo: "ingreso", concepto: "Honorarios de noviembre", monto: "1000.00", fecha: "2026-11-01", fechaVencimiento: "2026-11-30", clienteId: cliente.id, responsableId: idDe(usuarios[1].email),
  });
  assert.equal(ingreso.status, 201, JSON.stringify(ingreso.data));
  assert.equal((await apiE2E(baseUrl, lusmiA, "/api/despacho/finanzas?mes=2026-11&unidad=despacho")).status, 403, "el acceso global de Lusmi es solo para actividades");
  const abono = await apiE2E(baseUrl, adminA, `/api/despacho/finanzas/${ingreso.data.movimiento.id}/pagos`, "POST", { monto: "250.00", fecha: "2026-11-20", metodo: "transferencia" });
  assert.equal(abono.status, 200);
  const finanzas = await apiE2E<{ movimientos: MovimientoDto[]; porCobrar: { saldo: string }[]; cobradoEnMes: string }>(baseUrl, adminA, "/api/despacho/finanzas?mes=2026-11&unidad=despacho");
  assert.equal(Number(finanzas.data.porCobrar[0]?.saldo), 750);
  assert.equal(Number(finanzas.data.cobradoEnMes), 250);
  const finanzasOrgB = await apiE2E<{ movimientos: MovimientoDto[] }>(baseUrl, adminB, "/api/despacho/finanzas?mes=2026-11&unidad=despacho");
  assert.equal(finanzasOrgB.data.movimientos.length, 0, "las finanzas quedan aisladas por organización");

  for (const ruta of ["/despacho", "/despacho/rendimiento?mes=2026-11", "/despacho/tablero?periodo=2026-11", "/despacho/mi-trabajo", "/despacho/clientes", "/despacho/configuracion", "/despacho/finanzas", `/despacho/clientes/${cliente.id}?mes=2026-11`]) {
    assert.equal(await paginaE2E(baseUrl, adminA, ruta), 200, ruta);
  }
  assert.equal(await paginaE2E(baseUrl, lusmiA, "/despacho/rendimiento?mes=2026-11"), 200);

  await admin.query("UPDATE modulos_org SET activo=false WHERE org_id=$1 AND clave='despacho'", [String(orgA)]);
  assert.equal((await apiE2E(baseUrl, adminA, "/api/despacho/procesos")).status, 404);
  assert.equal((await apiE2E(baseUrl, adminA, "/api/despacho/clientes", "POST", { contactoId: contactoA })).status, 404);
  assert.equal((await apiE2E(baseUrl, adminA, "/api/despacho/generar", "POST", { mes: "2026-12" })).status, 404);
  await admin.query("UPDATE modulos_org SET activo=true WHERE org_id=$1 AND clave='despacho'", [String(orgA)]);

  console.log("HTTP Despacho completo: login real, procesos, clientes, generación idempotente, permisos, versiones, transiciones, tenant y módulo desactivado OK");
}

try {
  await main();
} finally {
  for (const tabla of [
    "despacho_finanza_pagos",
    "despacho_movimientos_financieros",
    "despacho_actividad_cambios",
    "despacho_actividades",
    "despacho_cliente_procesos",
    "despacho_clientes",
    "despacho_proceso_actividades",
    "despacho_procesos",
    "contactos",
    "usuarios",
    "modulos_org",
  ]) {
    await admin.query(`DELETE FROM ${tabla} WHERE org_id IN ($1,$2)`, [String(orgA), String(orgB)]);
  }
  await admin.query("DELETE FROM orgs WHERE id IN ($1,$2)", [String(orgA), String(orgB)]);
  await admin.end();
}
