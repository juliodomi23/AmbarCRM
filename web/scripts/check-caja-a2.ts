import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  validarAbonoApartado,
  validarAbonoCredito,
  validarApartado,
  validarDevolucion,
  validarLimiteCredito,
  validarVentaCredito,
} from "../src/lib/caja-a2.ts";
import { canalRecordatorioSaldo } from "../src/lib/credito-recordatorio.ts";

const [schema, sql, servicio, interfaz] = await Promise.all([
  readFile(new URL("../prisma/schema.prisma", import.meta.url), "utf8"),
  readFile(new URL("../prisma/sql/actualizaciones.sql", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/caja-a2-db.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/components/caja/OperacionesCajaA2.tsx", import.meta.url), "utf8"),
]);

for (const modelo of ["DevolucionVenta", "DevolucionPartida", "Apartado", "AbonoApartado", "CuentaCliente", "MovimientoCuentaCliente", "NotaCreditoCliente"]) {
  assert.match(schema, new RegExp(`model ${modelo}`));
}
for (const tabla of ["devoluciones_venta", "devolucion_partidas", "apartados", "abonos_apartado", "cuentas_cliente", "movimientos_cuenta_cliente", "notas_credito_cliente"]) {
  assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${tabla}`));
}
assert.match(servicio, /bloquearVenta[\s\S]*bloquearProductos/);
assert.match(servicio, /bloquearCuenta[\s\S]*prepararPartidas/);
assert.match(servicio, /bloquearTurnoCaja[\s\S]*bloquearVenta[\s\S]*bloquearProductos/);
assert.match(servicio, /estado: "cancelada", stockAplicado: false/);
assert.match(interfaz, /Devoluciones y cambios/);
assert.match(interfaz, /Apartados/);
assert.match(interfaz, /Crédito del cliente/);

assert.ok("data" in validarDevolucion({ ventaId: "1", tipoReembolso: "efectivo", partidas: [{ ventaPartidaId: "2", cantidad: "0.500" }] }));
assert.ok("error" in validarDevolucion({ ventaId: "1", tipoReembolso: "otro", partidas: [] }));
assert.ok("data" in validarApartado({ turnoId: "1", contactoId: "2", uuidCliente: "apartado-1", anticipo: "10.00", metodo: "efectivo", partidas: [{ productoId: "3", cantidad: "1", descuento: "0" }] }));
assert.ok("data" in validarAbonoApartado({ turnoId: "1", monto: "12.50", metodo: "tarjeta" }));
assert.ok("data" in validarVentaCredito({ turnoId: "1", contactoId: "2", uuidCliente: "credito-1", partidas: [{ productoId: "3", cantidad: "1", descuento: "0" }] }));
assert.ok("data" in validarLimiteCredito({ limiteCredito: "1500.00" }));
assert.ok("data" in validarAbonoCredito({ turnoId: "1", contactoId: "2", monto: "100", metodo: "transferencia" }));
assert.equal(canalRecordatorioSaldo(true, null), "texto");
assert.equal(canalRecordatorioSaldo(false, { name: "saldo", language: "es_MX" }), "plantilla");
assert.equal(canalRecordatorioSaldo(false, null), "sin_plantilla");

console.log("caja A2: devoluciones, apartados, crédito, bloqueos y WhatsApp OK");
