import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";
import { Prisma } from "@prisma/client";
import { abrirTurnoCaja, cerrarTurnoCaja, corteX, ErrorCaja, registrarVentaCaja } from "../../src/lib/caja-db";
import { ErrorSinRed, registrarVentaSinRed } from "../../src/lib/caja-sinred-db";
import type { VentaSinRedEntrada } from "../../src/lib/caja-sinred";
import { dbRaw } from "../../src/lib/db";
import { crearPedido } from "../../src/lib/pedidos-db";
import { configPedidos } from "../../src/lib/pedidos";
import { transaccionTenant } from "../../src/lib/retail-db";

const { Pool } = pg;
const adminUrl = process.env.ADMIN_DATABASE_URL;
if (!adminUrl) throw new Error("Define ADMIN_DATABASE_URL con el usuario dueño");
const admin = new Pool({ connectionString: adminUrl, max: 1 });
const sinProteccion = process.env.SINRED_SIN_PROTECCION === "1";
const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const orgId = BigInt(Date.now()) * 1000n + 941n;
const pausa = (ms = 150) => new Promise((resolver) => setTimeout(resolver, ms));
const D = (valor: string | number) => new Prisma.Decimal(valor);
const folio = () => `SR-${randomBytes(5).toString("hex").toUpperCase()}`;

type Cajero = { id: bigint; turnoId: bigint; identidad: { orgId: bigint; userId: bigint; rol: string; puesto: string } };

async function preparar() {
  await admin.query("INSERT INTO orgs (id, nombre, slug) VALUES ($1, 'Ventas sin red', $2)", [String(orgId), `sinred-${sufijo}`]);
  return transaccionTenant(orgId, async (tx) => {
    await tx.moduloOrg.createMany({ data: [
      { clave: "caja", activo: true, config: { ventasSinRed: true } },
      { clave: "productos", activo: true, config: {} }, { clave: "ventas", activo: true, config: {} },
      { clave: "pedidos_en_linea", activo: true, config: {} },
    ] });
    const cajeros: Cajero[] = [];
    for (const indice of [1, 2, 3]) {
      const usuario = await tx.usuario.create({ data: { nombre: `Cajero ${indice}`, email: `sinred-${indice}-${sufijo}@test.local`, passwordHash: "x", puesto: "Cajero" } });
      const caja = await tx.caja.create({ data: { nombre: `Caja ${indice} ${sufijo}` } });
      const turno = await tx.turnoCaja.create({ data: { cajaId: caja.id, usuarioId: usuario.id, fondoInicial: 100 } });
      cajeros.push({ id: usuario.id, turnoId: turno.id, identidad: { orgId, userId: usuario.id, rol: "agente", puesto: "Cajero" } });
    }
    const producto = (sku: string, stock: number, precio: number) =>
      tx.producto.create({ data: { sku: `${sku}-${sufijo}`, nombre: `Producto ${sku}`, precio, costo: 10, stock, visibleEnLinea: true } });
    return {
      cajeros,
      reenvio: await producto("REENVIO", 5, 50),
      ultimo: await producto("ULTIMO", 1, 80),
      contraPedido: await producto("PEDIDO", 1, 60),
      pedidoPrimero: await producto("PEDIDO2", 1, 70),
      precio: await producto("PRECIO", 5, 100),
      corte: await producto("CORTE", 50, 10),
      antiguo: await producto("ANTIGUO", 5, 10),
    };
  });
}

function venta(cajero: Cajero, productoId: bigint, o: { uuid?: string; total: number; cantidad?: number; vendidaAt?: Date; turnoId?: bigint; pago?: number; metodo?: "efectivo" | "tarjeta" }): VentaSinRedEntrada {
  return {
    orgId: String(orgId), userId: String(cajero.id), turnoId: o.turnoId ?? cajero.turnoId,
    uuidCliente: o.uuid ?? randomUUID(), folio: folio(), vendidaAt: o.vendidaAt ?? new Date(), totalCobrado: D(o.total),
    descuento: D(0), notas: null, catalogoVersion: "v-prueba",
    partidas: [{ productoId, cantidad: D(o.cantidad ?? 1), descuento: D(0) }],
    pagos: [{ metodo: o.metodo ?? "efectivo", monto: D(o.pago ?? o.total) }],
  };
}

/** Copia SIN idempotencia ni bloqueo: sin uuid_cliente, lee el stock, espera y escribe (lo que haría una cola ingenua). */
async function sinRedIngenuo(cajero: Cajero, productoId: bigint, total: number, conUuid: string | null) {
  return transaccionTenant(orgId, async (tx) => {
    const producto = await tx.producto.findUniqueOrThrow({ where: { id: productoId } });
    await pausa(120);
    const creada = await tx.venta.create({ data: {
      folio: folio(), turnoId: cajero.turnoId, creadoPorId: cajero.id, uuidCliente: conUuid, estado: "pagada", canal: "mostrador",
      subtotal: total, total, stockAplicado: true, sinRed: true,
      partidas: { create: { productoId, cantidad: 1, precioUnitario: total, total } },
    } });
    await tx.producto.update({ where: { id: productoId }, data: { stock: producto.stock.minus(1) } });
    return creada;
  });
}

const stockDe = (productoId: bigint) => transaccionTenant(orgId, async (tx) => (await tx.producto.findUniqueOrThrow({ where: { id: productoId } })).stock);

async function main() {
  const base = await preparar();
  const [uno, dos, tres] = base.cajeros;
  const resultado: Record<string, unknown> = { modo: sinProteccion ? "SIN_PROTECCION" : "CON_PROTECCION" };

  // 1) La misma venta sin red reenviada 5 veces al mismo tiempo (cola reenviada).
  const uuid = randomUUID();
  const reenvios = await Promise.allSettled(Array.from({ length: 5 }, () => sinProteccion
    ? sinRedIngenuo(uno, base.reenvio.id, 50, null)
    : registrarVentaSinRed(uno.identidad, venta(uno, base.reenvio.id, { uuid, total: 50 }))));
  const ventasReenvio = await transaccionTenant(orgId, (tx) => tx.venta.count({ where: { partidas: { some: { productoId: base.reenvio.id } } } }));
  resultado.colaReenviada = {
    peticiones: 5, exitosas: reenvios.filter((r) => r.status === "fulfilled").length,
    ventasGuardadas: ventasReenvio, existenciaFinal: Number(await stockDe(base.reenvio.id)),
  };

  // 2) Dos cajas sin red venden el último producto a la vez.
  const dosCajas = await Promise.allSettled([
    sinProteccion ? sinRedIngenuo(uno, base.ultimo.id, 80, randomUUID()) : registrarVentaSinRed(uno.identidad, venta(uno, base.ultimo.id, { total: 80 })),
    sinProteccion ? sinRedIngenuo(dos, base.ultimo.id, 80, randomUUID()) : registrarVentaSinRed(dos.identidad, venta(dos, base.ultimo.id, { total: 80 })),
  ]);
  const movimientos = await transaccionTenant(orgId, async (tx) => ({
    ventas: await tx.venta.count({ where: { partidas: { some: { productoId: base.ultimo.id } } } }),
    marcadas: await tx.venta.count({ where: { partidas: { some: { productoId: base.ultimo.id } }, revisionMotivos: { has: "inventario_negativo" } } }),
    movimientosSinRed: await tx.movimientoInventario.count({ where: { productoId: base.ultimo.id, sinRed: true } }),
  }));
  resultado.dosCajasSinRed = {
    intentos: 2, exitosas: dosCajas.filter((r) => r.status === "fulfilled").length, ventas: movimientos.ventas,
    existenciaFinal: Number(await stockDe(base.ultimo.id)), ventasMarcadasNegativo: movimientos.marcadas, movimientosSinRed: movimientos.movimientosSinRed,
  };

  if (!sinProteccion) {
    // 3a) Sin red del último producto → un pedido en línea después sigue rechazando la sobreventa.
    await registrarVentaSinRed(tres.identidad, venta(tres, base.contraPedido.id, { total: 60 }));
    const configuracion = configPedidos({ maxPorTelefono: 10, maxPorIp: 10 });
    const entradaPedido = (productoId: bigint, telefono: string, ip: string) => ({
      uuidCliente: randomUUID(), nombre: "Cliente en línea", telefono10: telefono, ip, tipoEntrega: "recoger" as const,
      direccion: null, horarioDeseado: null, notas: null, partidas: [{ productoId, cantidad: D(1) }],
    });
    const rechazado = await crearPedido(orgId, configuracion, entradaPedido(base.contraPedido.id, "5551110001", "127.0.1.1")).then(() => "aceptado", (error) => `rechazado ${(error as { status?: number }).status}`);
    // 3b) Pedido en línea primero (reserva el último) → la venta sin red igual entra y deja −1 marcado.
    await crearPedido(orgId, configuracion, entradaPedido(base.pedidoPrimero.id, "5551110002", "127.0.1.2"));
    const tardia = await registrarVentaSinRed(tres.identidad, venta(tres, base.pedidoPrimero.id, { total: 70 }));
    const marcas = tardia.venta.revisionMotivos;
    resultado.contraPedidoEnLinea = {
      existenciaTrasVentaSinRed: Number(await stockDe(base.contraPedido.id)), pedidoDespuesDeSinRed: rechazado,
      pedidoPrimeroLuegoSinRed: { existencia: Number(await stockDe(base.pedidoPrimero.id)), marcas },
    };

    // 4) Precio distinto: se respeta lo cobrado y queda marcada (la ruta normal habría rechazado "no cubre").
    const barata = await registrarVentaSinRed(tres.identidad, venta(tres, base.precio.id, { total: 90 }));
    const normal = await registrarVentaCaja(
      { ...tres.identidad },
      { turnoId: tres.turnoId, contactoId: null, uuidCliente: randomUUID(), descuento: D(0), notas: null,
        partidas: [{ productoId: base.precio.id, cantidad: D(1), descuento: D(0) }], pagos: [{ metodo: "efectivo", monto: D(90) }] },
    ).then(() => "aceptada", (error) => (error instanceof ErrorCaja ? `rechazada: ${error.message}` : "otro error"));
    resultado.precioDistinto = {
      cobrado: barata.venta.total.toFixed(2), servidor: "100.00", diferenciaPrecio: barata.venta.diferenciaPrecio?.toFixed(2),
      marcas: barata.venta.revisionMotivos, rutaNormal: normal,
    };

    // 5) Corte con ventas que llegan tarde.
    await admin.query("UPDATE turnos_caja SET abierto_at = now() - interval '2 hours' WHERE id = $1", [String(tres.turnoId)]);
    // (las ventas de los pasos 3 y 4 ya están en este turno: se resta su efectivo para fijar el esperado)
    const antes = await corteX(tres.identidad, tres.turnoId);
    await registrarVentaSinRed(tres.identidad, venta(tres, base.corte.id, { total: 50, cantidad: 5, vendidaAt: new Date(Date.now() - 10 * 60_000) }));
    const cierre = await cerrarTurnoCaja(tres.identidad, tres.turnoId, antes.efectivoEsperado.plus(50));
    const esperadoGuardado = cierre.turno.efectivoEsperado!;
    const tardiaCerrado = await registrarVentaSinRed(tres.identidad, venta(tres, base.corte.id, { total: 30, cantidad: 3, vendidaAt: new Date(Date.now() - 5 * 60_000) }));
    const alVuelo = await corteX(tres.identidad, tres.turnoId);
    const ingenuo = await admin.query<{ efectivo: string }>(
      `SELECT COALESCE(SUM(p.monto - v.cambio), 0)::text AS efectivo FROM ventas v JOIN pagos_venta p ON p.venta_id = v.id AND p.metodo = 'efectivo'
        WHERE v.turno_id = $1 AND v.estado <> 'cancelada'`, [String(tres.turnoId)],
    );
    const cierreMs = cierre.turno.cerradoAt!.getTime();
    const despuesDelCorte = venta(tres, base.corte.id, { total: 20, cantidad: 2, vendidaAt: new Date(cierreMs + 20 * 60_000) });
    const ahoraTarde = new Date(cierreMs + 60 * 60_000);
    const sinTurno = await registrarVentaSinRed(tres.identidad, despuesDelCorte, ahoraTarde).then(() => "aceptada", (error) => (error instanceof ErrorSinRed ? error.codigo : "otro"));
    const turnoNuevo = await abrirTurnoCaja(tres.identidad, { cajaId: cierre.turno.cajaId, fondoInicial: D(0) });
    const enTurnoNuevo = await registrarVentaSinRed(tres.identidad, despuesDelCorte, ahoraTarde);
    const corteNuevo = await corteX(tres.identidad, turnoNuevo.id);
    resultado.corteConVentasTardias = {
      esperadoGuardadoZ: esperadoGuardado.toFixed(2), esperadoEnVivoTrasTardia: alVuelo.efectivoEsperado.toFixed(2),
      tardiaEnTurnoCerrado: { marcas: tardiaCerrado.venta.revisionMotivos, turnoId: String(tardiaCerrado.venta.turnoId) === String(tres.turnoId) },
      tardias: { ventas: alVuelo.tardias.ventas, efectivo: alVuelo.tardias.efectivo.toFixed(2) },
      sumaIngenuaDelTurnoCerrado: Number(ingenuo.rows[0].efectivo) + Number(antes.turno.fondoInicial) + Number(antes.entradas) - Number(antes.salidas),
      sinTurnoAbierto: sinTurno, enTurnoNuevo: { marcas: enTurnoNuevo.venta.revisionMotivos, turnoOriginal: String(enTurnoNuevo.venta.turnoOriginalId) === String(tres.turnoId) },
      esperadoTurnoNuevo: corteNuevo.efectivoEsperado.toFixed(2),
    };
    assert.equal(alVuelo.efectivoEsperado.toFixed(2), esperadoGuardado.toFixed(2), "el corte Z no cambia con ventas tardías");
    assert.deepEqual(tardiaCerrado.venta.revisionMotivos, ["tardia"]);
    assert.equal(sinTurno, "TURNO_REQUERIDO");
    assert.deepEqual(enTurnoNuevo.venta.revisionMotivos, ["tardia"]);
    assert.equal(corteNuevo.efectivoEsperado.toFixed(2), "20.00");
    assert.equal(alVuelo.tardias.efectivo.toFixed(2), "30.00");

    // 6) Ventanas de tiempo: 72 h, futuro, y esperando turno que caduca.
    const hace73h = new Date(Date.now() - 73 * 3_600_000);
    await admin.query("UPDATE turnos_caja SET abierto_at = now() - interval '5 days' WHERE id = $1", [String(turnoNuevo.id)]);
    const antigua = await registrarVentaSinRed(tres.identidad, venta(tres, base.antiguo.id, { total: 10, vendidaAt: hace73h, turnoId: turnoNuevo.id })).then(() => "aceptada", (error) => (error instanceof ErrorSinRed ? error.codigo : "otro"));
    const futura = await registrarVentaSinRed(tres.identidad, venta(tres, base.antiguo.id, { total: 10, vendidaAt: new Date(Date.now() + 3_600_000), turnoId: turnoNuevo.id })).then(() => "aceptada", (error) => (error instanceof ErrorSinRed ? error.codigo : "otro"));
    const sinVentana = await registrarVentaSinRed(tres.identidad, venta(tres, base.antiguo.id, { total: 10, vendidaAt: hace73h, turnoId: turnoNuevo.id }), hace73h).then((r) => (r.repetida ? "repetida" : "aceptada"), (error) => (error instanceof ErrorSinRed ? error.codigo : "otro"));
    // esperando turno > 72 h: el turno original ya cerrado, sin turno abierto, vendida hace 73 h → la ventana manda
    await cerrarTurnoCaja(tres.identidad, turnoNuevo.id, D(0)).catch(() => undefined);
    const esperandoCaducada = await registrarVentaSinRed(tres.identidad, venta(tres, base.antiguo.id, { total: 10, vendidaAt: hace73h, turnoId: tres.turnoId })).then(() => "aceptada", (error) => (error instanceof ErrorSinRed ? error.codigo : "otro"));
    resultado.ventanas = { haceMasDe72h: antigua, futura, ventanaDesactivada: sinVentana, esperandoTurnoCaducada: esperandoCaducada };
    assert.equal(antigua, "VENTA_MUY_ANTIGUA");
    assert.equal(futura, "FECHA_FUTURA");
    assert.equal(esperandoCaducada, "VENTA_MUY_ANTIGUA");

    assert.deepEqual(resultado.colaReenviada, { peticiones: 5, exitosas: 5, ventasGuardadas: 1, existenciaFinal: 4 });
    const dosCajasEsperado = resultado.dosCajasSinRed as { exitosas: number; ventas: number; existenciaFinal: number; ventasMarcadasNegativo: number };
    assert.equal(dosCajasEsperado.exitosas, 2);
    assert.equal(dosCajasEsperado.ventas, 2);
    assert.equal(dosCajasEsperado.existenciaFinal, -1);
    assert.equal(dosCajasEsperado.ventasMarcadasNegativo, 1);
    const contra = resultado.contraPedidoEnLinea as { existenciaTrasVentaSinRed: number; pedidoDespuesDeSinRed: string; pedidoPrimeroLuegoSinRed: { existencia: number; marcas: string[] } };
    assert.equal(contra.existenciaTrasVentaSinRed, 0);
    assert.match(contra.pedidoDespuesDeSinRed, /^rechazado 409/);
    assert.equal(contra.pedidoPrimeroLuegoSinRed.existencia, 0);
    assert.equal(resultado.precioDistinto && (resultado.precioDistinto as { diferenciaPrecio: string }).diferenciaPrecio, "10.00");
  }
  console.log(JSON.stringify(resultado));
}

async function limpiar() {
  await admin.query("SET session_replication_role = replica");
  try {
    const tablas = await admin.query<{ table_name: string }>("SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'org_id'");
    for (const { table_name } of tablas.rows) await admin.query(`DELETE FROM "${table_name.replaceAll('"', '""')}" WHERE org_id = $1`, [String(orgId)]);
    await admin.query("DELETE FROM orgs WHERE id = $1", [String(orgId)]);
  } finally { await admin.query("SET session_replication_role = origin"); }
}

main().catch((error) => { console.error("FALLO:", error); process.exitCode = 1; }).finally(async () => {
  await limpiar().catch(console.error);
  await Promise.all([dbRaw.$disconnect(), admin.end()]);
});
