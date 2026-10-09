import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  descuentoMaximoCajero,
  puedeAutorizarDescuento,
  puedeCancelarVentaCaja,
  puedeGestionarTurnos,
  validarAperturaTurno,
  validarCierreTurno,
  validarMovimientoCaja,
  validarVentaCaja,
} from "../src/lib/caja.ts";

const [catalogo, schema, sql, cajaDb, estadoVentaDb, pantalla, ticket, estilosTicket, estilosGlobales] = await Promise.all([
  readFile(new URL("../src/lib/modulos.ts", import.meta.url), "utf8"),
  readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8"),
  readFile(new URL("../prisma/sql/actualizaciones.sql", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/caja-db.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/venta-estado-db.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/components/caja/CajaCliente.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/caja/ticket/[ventaId]/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/caja/ticket/[ventaId]/ticket.module.css", import.meta.url), "utf8"),
  readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
]);

assert.match(catalogo, /clave: "caja"[\s\S]*?ruta: "\/caja"/);
for (const modelo of ["Caja", "TurnoCaja", "MovimientoCaja", "PagoVenta"]) assert.match(schema, new RegExp(`model ${modelo}`));
for (const tabla of ["cajas", "turnos_caja", "movimientos_caja", "pagos_venta"]) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${tabla}`));
assert.match(sql, /turnos_caja_usuario_abierto_uq/);
assert.match(sql, /turnos_caja_caja_abierta_uq/);
assert.match(sql, /ventas_org_uuid_cliente_uq/);
assert.match(cajaDb, /bloquearTurnoCaja[\s\S]*bloquearProductos/);
assert.match(cajaDb, /data: \{ stock: existenciaDespues \}/);
assert.match(estadoVentaDb, /bloquearTurnoCaja[\s\S]*bloquearVenta[\s\S]*bloquearProductos/);
assert.match(estadoVentaDb, /Este turno ya tuvo corte; registra una devolución/);
assert.match(pantalla, /F2/);
assert.match(pantalla, /codigoBarras/);
assert.match(pantalla, /normalize\("NFD"\)/);
assert.match(ticket, /venta\.pagos/);
assert.match(ticket, /venta\.cambio/);
assert.match(ticket, /if \(!sesion\?\.user\) redirect\("\/login"\)/);
assert.match(estilosTicket, /@page ticket-80/);
assert.match(estilosTicket, /@page ticket-58/);
assert.doesNotMatch(estilosGlobales, /@page/);
assert.doesNotMatch(estilosGlobales, /body \* \{ visibility: hidden/);

assert.ok("data" in validarAperturaTurno({ cajaId: "1", fondoInicial: "500.00" }));
assert.ok("error" in validarAperturaTurno({ cajaId: "", fondoInicial: "500" }));
assert.ok("data" in validarMovimientoCaja({ turnoId: "1", tipo: "entrada", monto: "20", motivo: "Cambio" }));
assert.ok("error" in validarMovimientoCaja({ turnoId: "1", tipo: "salida", monto: "0", motivo: "" }));
assert.ok("data" in validarCierreTurno({ efectivoContado: "123.45" }));
assert.ok("data" in validarVentaCaja({
  turnoId: "1",
  uuidCliente: "peticion-1",
  partidas: [{ productoId: "2", cantidad: "0.750", descuento: "5" }],
  pagos: [{ metodo: "efectivo", monto: "50" }, { metodo: "tarjeta", monto: "100" }],
}));
assert.ok("error" in validarVentaCaja({ turnoId: "1", uuidCliente: "", partidas: [], pagos: [] }));
assert.equal(descuentoMaximoCajero({ descuentoMaximoCajero: 7.5 }), 7.5);
assert.equal(puedeAutorizarDescuento("agente", "Cajero"), false);
assert.equal(puedeAutorizarDescuento("agente", "Encargado de tienda"), true);
assert.equal(puedeCancelarVentaCaja("admin", "Administrador"), true);
assert.equal(puedeGestionarTurnos("agente", "Cajero"), false);
assert.equal(puedeGestionarTurnos("agente", "Encargado de tienda"), true);
assert.equal(puedeGestionarTurnos("admin", "Administrador"), true);

console.log("caja: turnos, cobro mixto, descuentos, cortes, ticket, lealtad y permisos OK");
