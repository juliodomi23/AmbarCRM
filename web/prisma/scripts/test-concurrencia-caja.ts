import assert from "node:assert/strict";
import pg from "pg";
import { Prisma } from "@prisma/client";
import { dbRaw } from "../../src/lib/db";
import { abrirTurnoCaja, cerrarTurnoCaja, registrarVentaCaja } from "../../src/lib/caja-db";
import { bloquearProductos, transaccionTenant } from "../../src/lib/retail-db";
import { cambiarEstadoVenta } from "../../src/lib/venta-estado-db";

const { Pool } = pg;
const adminUrl = process.env.ADMIN_DATABASE_URL;
if (!adminUrl) throw new Error("Define ADMIN_DATABASE_URL con el usuario dueño");
const admin = new Pool({ connectionString: adminUrl, max: 1 });
const sinProteccion = process.env.CAJA_SIN_PROTECCION === "1";
const pausa = () => new Promise((resolve) => setTimeout(resolve, 100));
const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const orgId = BigInt(Date.now()) * 1000n + 419n;

type Actor = { userId: bigint; orgId: bigint; rol: "agente"; puesto: string };

async function preparar() {
  await admin.query("INSERT INTO orgs (id, nombre, slug) VALUES ($1, 'Concurrencia caja', $2)", [orgId.toString(), `caja-${sufijo}`]);
  return transaccionTenant(orgId, async (tx) => {
    await tx.moduloOrg.create({ data: { clave: "caja", activo: true, config: { descuentoMaximoCajero: 10 } } });
    const usuarios = await Promise.all(Array.from({ length: 6 }, (_, i) => tx.usuario.create({ data: { nombre: `Cajero ${i}`, email: `cajero-${i}-${sufijo}@test.local`, passwordHash: "no-login", puesto: "Cajero" } })));
    const cajas = await Promise.all(Array.from({ length: 7 }, (_, i) => tx.caja.create({ data: { nombre: `Caja ${i}-${sufijo}` } })));
    const producto = await tx.producto.create({ data: { sku: `ULTIMO-${sufijo}`, nombre: "Última pieza", precio: 100, stock: 0 } });
    const repetible = await tx.producto.create({ data: { sku: `UUID-${sufijo}`, nombre: "Producto idempotente", precio: 25, stock: 0 } });
    const cancelable = await tx.producto.create({ data: { sku: `CANCEL-${sufijo}`, nombre: "Producto cancelable", precio: 100, stock: 0 } });
    await bloquearProductos(tx, [producto.id, repetible.id, cancelable.id]);
    await tx.producto.update({ where: { id: producto.id }, data: { stock: 1 } });
    await tx.producto.update({ where: { id: repetible.id }, data: { stock: 20 } });
    await tx.producto.update({ where: { id: cancelable.id }, data: { stock: 1 } });
    return { usuarios, cajas, producto, repetible, cancelable };
  });
}

async function abrirSinProteccion(actor: Actor, cajaId: bigint) {
  return transaccionTenant(orgId, async (tx) => {
    const existente = await tx.turnoCaja.findFirst({ where: { OR: [{ usuarioId: actor.userId }, { cajaId }], estado: "abierto" } });
    if (existente) throw new Error("turno ocupado");
    await pausa();
    return tx.turnoCaja.create({ data: { usuarioId: actor.userId, cajaId, fondoInicial: 0 } });
  });
}

async function venderSinProteccion(actor: Actor, turnoId: bigint, productoId: bigint, uuidCliente: string) {
  return transaccionTenant(orgId, async (tx) => {
    const repetida = await tx.venta.findFirst({ where: { uuidCliente } });
    if (repetida) return repetida;
    const [turno, producto] = await Promise.all([
      tx.turnoCaja.findUniqueOrThrow({ where: { id: turnoId } }),
      tx.producto.findUniqueOrThrow({ where: { id: productoId } }),
    ]);
    if (producto.stock.lt(1)) throw new Error("sin stock");
    await pausa();
    const venta = await tx.venta.create({ data: { folio: `S-${crypto.randomUUID()}`, turnoId, cajaId: turno.cajaId, uuidCliente, creadoPorId: actor.userId, estado: "pagada", subtotal: 100, total: 100, stockAplicado: true } });
    await tx.ventaPartida.create({ data: { ventaId: venta.id, productoId, cantidad: 1, precioUnitario: 100, total: 100 } });
    await tx.pagoVenta.create({ data: { ventaId: venta.id, metodo: "efectivo", monto: 100 } });
    await tx.producto.update({ where: { id: productoId }, data: { stock: producto.stock.minus(1) } });
    return venta;
  });
}

async function esperadoSegunVentas(turnoId: bigint) {
  return transaccionTenant(orgId, async (tx) => {
    const turno = await tx.turnoCaja.findUniqueOrThrow({ where: { id: turnoId } });
    const [ventas, movimientos] = await Promise.all([
      tx.venta.findMany({ where: { turnoId, estado: { not: "cancelada" } }, include: { pagos: true } }),
      tx.movimientoCaja.findMany({ where: { turnoId } }),
    ]);
    const efectivo = ventas.reduce(
      (total, venta) => total.plus(venta.pagos.find((pago) => pago.metodo === "efectivo")?.monto ?? 0).minus(venta.cambio),
      new Prisma.Decimal(0),
    );
    const entradas = movimientos.filter((m) => m.tipo === "entrada").reduce((total, m) => total.plus(m.monto), new Prisma.Decimal(0));
    const salidas = movimientos.filter((m) => m.tipo === "salida").reduce((total, m) => total.plus(m.monto), new Prisma.Decimal(0));
    return turno.fondoInicial.plus(efectivo).plus(entradas).minus(salidas);
  });
}

async function carreraCancelacionCorteSinProteccion(turnoId: bigint, ventaId: bigint) {
  let avisarCorteCalculado!: () => void;
  let avisarCancelacionConfirmada!: () => void;
  const corteCalculado = new Promise<void>((resolve) => { avisarCorteCalculado = resolve; });
  const cancelacionConfirmada = new Promise<void>((resolve) => { avisarCancelacionConfirmada = resolve; });

  const cierre = transaccionTenant(orgId, async (tx) => {
    const turno = await tx.turnoCaja.findUniqueOrThrow({ where: { id: turnoId } });
    const ventas = await tx.venta.findMany({
      where: { turnoId, estado: { not: "cancelada" } },
      include: { pagos: true },
    });
    const efectivoEsperado = ventas.reduce(
      (total, venta) => total.plus(venta.pagos.find((pago) => pago.metodo === "efectivo")?.monto ?? 0).minus(venta.cambio),
      turno.fondoInicial,
    );
    avisarCorteCalculado();
    await cancelacionConfirmada;
    return tx.turnoCaja.update({
      where: { id: turnoId },
      data: { estado: "cerrado", cerradoAt: new Date(), efectivoEsperado, efectivoContado: efectivoEsperado, diferencia: 0 },
    });
  });

  const cancelacion = (async () => {
    await corteCalculado;
    await transaccionTenant(orgId, async (tx) => {
      const venta = await tx.venta.findUniqueOrThrow({ where: { id: ventaId }, include: { partidas: true } });
      for (const partida of venta.partidas) {
        const producto = await tx.producto.findUniqueOrThrow({ where: { id: partida.productoId } });
        await tx.producto.update({ where: { id: producto.id }, data: { stock: producto.stock.plus(partida.cantidad) } });
      }
      await tx.venta.update({ where: { id: ventaId }, data: { estado: "cancelada", stockAplicado: false } });
    });
    avisarCancelacionConfirmada();
  })();

  await Promise.all([cierre, cancelacion]);
  return { cancelacion: "cumplida", cierre: "cumplido" };
}

async function carreraCancelacionCorteConProteccion(actor: Actor, turnoId: bigint, ventaId: bigint) {
  const encargado = { ...actor, puesto: "Encargado de tienda" };
  const resultados = await Promise.allSettled([
    cambiarEstadoVenta(encargado, ventaId, "cancelada"),
    cerrarTurnoCaja(actor, turnoId, new Prisma.Decimal(0)),
  ]);
  return {
    cancelacion: resultados[0].status === "fulfilled" ? "cumplida" : "rechazada409",
    cierre: resultados[1].status === "fulfilled" ? "cumplido" : "rechazado409",
  };
}

async function main() {
  if (sinProteccion) {
    await admin.query("DROP INDEX IF EXISTS turnos_caja_usuario_abierto_uq");
    await admin.query("DROP INDEX IF EXISTS turnos_caja_caja_abierta_uq");
    await admin.query("DROP INDEX IF EXISTS ventas_org_uuid_cliente_uq");
    await admin.query("DROP INDEX IF EXISTS ventas_org_id_uuid_cliente_key");
  }
  const base = await preparar();
  const actores: Actor[] = base.usuarios.map((usuario) => ({ userId: usuario.id, orgId, rol: "agente", puesto: "Cajero" }));
  const abrir = sinProteccion ? abrirSinProteccion : (actor: Actor, cajaId: bigint) => abrirTurnoCaja(actor, { cajaId, fondoInicial: new Prisma.Decimal(0) });

  const turnosVenta = await Promise.all([abrir(actores[0], base.cajas[0].id), abrir(actores[1], base.cajas[1].id)]);
  const vender = sinProteccion
    ? (actor: Actor, turnoId: bigint, productoId: bigint, uuid: string) => venderSinProteccion(actor, turnoId, productoId, uuid)
    : (actor: Actor, turnoId: bigint, productoId: bigint, uuid: string) => registrarVentaCaja(actor, { turnoId, contactoId: null, uuidCliente: uuid, descuento: new Prisma.Decimal(0), notas: null, partidas: [{ productoId, cantidad: new Prisma.Decimal(1), descuento: new Prisma.Decimal(0) }], pagos: [{ metodo: "efectivo", monto: new Prisma.Decimal(100) }] });

  const ultima = await Promise.allSettled([
    vender(actores[0], turnosVenta[0].id, base.producto.id, `ultima-a-${sufijo}`),
    vender(actores[1], turnosVenta[1].id, base.producto.id, `ultima-b-${sufijo}`),
  ]);
  const ventasUltima = ultima.filter((r) => r.status === "fulfilled").length;
  const stockUltima = await transaccionTenant(orgId, (tx) => tx.producto.findUniqueOrThrow({ where: { id: base.producto.id } }));

  const turnoUuid = await abrir(actores[2], base.cajas[2].id);
  const uuid = `igual-${sufijo}`;
  const mismas = await Promise.allSettled(Array.from({ length: 5 }, () => vender(actores[2], turnoUuid.id, base.repetible.id, uuid)));
  const ids = new Set(mismas.filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled").map((r) => String("venta" in r.value ? r.value.venta.id : r.value.id)));
  const ventasUuid = await transaccionTenant(orgId, (tx) => tx.venta.count({ where: { uuidCliente: uuid } }));

  const ventaCancelableResultado = await vender(actores[0], turnosVenta[0].id, base.cancelable.id, `cancelable-${sufijo}`);
  const ventaCancelableId = "venta" in ventaCancelableResultado ? ventaCancelableResultado.venta.id : ventaCancelableResultado.id;
  const carrera = sinProteccion
    ? await carreraCancelacionCorteSinProteccion(turnosVenta[0].id, ventaCancelableId)
    : await carreraCancelacionCorteConProteccion(actores[0], turnosVenta[0].id, ventaCancelableId);
  const [turnoTrasCarrera, esperadoFinal] = await Promise.all([
    transaccionTenant(orgId, (tx) => tx.turnoCaja.findUniqueOrThrow({ where: { id: turnosVenta[0].id } })),
    esperadoSegunVentas(turnosVenta[0].id),
  ]);

  const dobleUsuario = await Promise.allSettled([abrir(actores[3], base.cajas[3].id), abrir(actores[3], base.cajas[4].id)]);
  const dobleCaja = await Promise.allSettled([abrir(actores[4], base.cajas[5].id), abrir(actores[5], base.cajas[5].id)]);
  const resultado = {
    modo: sinProteccion ? "SIN_PROTECCION" : "CON_PROTECCION",
    ultimoProducto: { intentos: 2, ventas: ventasUltima, stockFinal: Number(stockUltima.stock) },
    uuidCliente: { peticiones: 5, respuestasExitosas: mismas.filter((r) => r.status === "fulfilled").length, ventasGuardadas: ventasUuid, idsDistintos: ids.size },
    aperturaUsuario: { intentos: 2, turnosAbiertos: dobleUsuario.filter((r) => r.status === "fulfilled").length },
    aperturaCaja: { intentos: 2, turnosAbiertos: dobleCaja.filter((r) => r.status === "fulfilled").length },
    cancelacionContraCorte: {
      ...carrera,
      esperadoGuardado: Number(turnoTrasCarrera.efectivoEsperado),
      esperadoSegunVentasFinales: Number(esperadoFinal),
      coincide: turnoTrasCarrera.efectivoEsperado?.equals(esperadoFinal) ?? false,
    },
  };
  if (!sinProteccion) {
    assert.deepEqual(resultado.ultimoProducto, { intentos: 2, ventas: 1, stockFinal: 0 });
    assert.equal(resultado.uuidCliente.ventasGuardadas, 1);
    assert.equal(resultado.uuidCliente.idsDistintos, 1);
    assert.equal(resultado.aperturaUsuario.turnosAbiertos, 1);
    assert.equal(resultado.aperturaCaja.turnosAbiertos, 1);
    assert.equal(resultado.cancelacionContraCorte.coincide, true);
  }
  console.log(JSON.stringify(resultado));
}

async function limpiar() {
  await admin.query("SET session_replication_role = replica");
  try {
    const tablas = await admin.query<{ table_name: string }>("SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'org_id'");
    for (const { table_name } of tablas.rows) await admin.query(`DELETE FROM "${table_name.replaceAll('"', '""')}" WHERE org_id = $1`, [orgId.toString()]);
    await admin.query("DELETE FROM orgs WHERE id = $1", [orgId.toString()]);
  } finally { await admin.query("SET session_replication_role = origin"); }
  if (sinProteccion) {
    await admin.query("CREATE UNIQUE INDEX IF NOT EXISTS turnos_caja_usuario_abierto_uq ON turnos_caja(usuario_id) WHERE estado = 'abierto'");
    await admin.query("CREATE UNIQUE INDEX IF NOT EXISTS turnos_caja_caja_abierta_uq ON turnos_caja(caja_id) WHERE estado = 'abierto'");
    await admin.query("CREATE UNIQUE INDEX IF NOT EXISTS ventas_org_uuid_cliente_uq ON ventas(org_id, uuid_cliente) WHERE uuid_cliente IS NOT NULL");
  }
}

main().catch((error) => { console.error("FALLO:", error); process.exitCode = 1; }).finally(async () => {
  await limpiar().catch((error) => console.error("No se pudo limpiar:", error));
  await Promise.all([dbRaw.$disconnect(), admin.end()]);
});
