import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { calcularCotizacion, configCotizaciones, cotizacionVencida, validarCotizacion, validarRespuestaCotizacion } from "../src/lib/cotizaciones";
import { canalEnvioCotizacion } from "../src/lib/cotizacion-envio";

const decimal = (valor: string) => new Prisma.Decimal(valor);
const partidas = [{ productoId: null, concepto: "Servicio decimal", cantidad: decimal("1.5"), precio: decimal("10.10"), descuento: decimal("0.15") }];
const masIva = calcularCotizacion(partidas, decimal("0.50"), { ivaPorcentaje: decimal("16"), preciosConIva: false });
assert.equal(masIva.subtotal.toString(), "15.15");
assert.equal(masIva.descuento.toString(), "0.65");
assert.equal(masIva.impuestos.toString(), "2.32");
assert.equal(masIva.total.toString(), "16.82");

const ivaIncluido = calcularCotizacion(
  [{ productoId: null, concepto: "Precio final", cantidad: decimal("2"), precio: decimal("90"), descuento: decimal("0") }],
  decimal("0"), { ivaPorcentaje: decimal("16"), preciosConIva: true },
);
assert.equal(ivaIncluido.total.toString(), "180");
assert.equal(ivaIncluido.impuestos.toString(), "24.83");

const manipulada = validarCotizacion({
  contactoId: "10", vigencia: "2026-10-30", descuento: "0", total: "0.01",
  partidas: [{ concepto: "Servidor manda", cantidad: "2", precio: "50", descuento: "0" }],
});
assert.ok("data" in manipulada);
assert.equal("total" in manipulada.data, false);
assert.deepEqual(configCotizaciones({ ivaPorcentaje: "8", preciosConIva: true }), { ivaPorcentaje: decimal("8"), preciosConIva: true });
assert.ok("error" in validarRespuestaCotizacion({ accion: "aceptar", nombre: "" }));
assert.equal(canalEnvioCotizacion(true), "texto");
assert.equal(canalEnvioCotizacion(false), "sin_plantilla");
assert.equal(canalEnvioCotizacion(false, { name: "cotizacion", language: "es_MX" }), "plantilla");
const vigencia = new Date("2026-10-09T12:00:00.000Z");
assert.equal(cotizacionVencida(vigencia, new Date("2026-10-10T02:00:00.000Z"), "America/Mexico_City"), false);
assert.equal(cotizacionVencida(vigencia, new Date("2026-10-10T06:01:00.000Z"), "America/Mexico_City"), true);

console.log(JSON.stringify({
  totalesMasIva: { subtotal: Number(masIva.subtotal), descuento: Number(masIva.descuento), impuestos: Number(masIva.impuestos), total: Number(masIva.total) },
  preciosConIva: { total: Number(ivaIncluido.total), impuestosIncluidos: Number(ivaIncluido.impuestos) },
  totalNavegadorIgnorado: true,
  vigenciaMexico: { ultimoDia20h: "vigente", diaSiguiente0001: "vencida" },
  whatsapp: { ventanaAbierta: "texto", ventanaCerradaSinPlantilla: "sin_plantilla", ventanaCerradaConPlantilla: "plantilla" },
}));
