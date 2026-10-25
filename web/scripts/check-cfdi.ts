import assert from "node:assert/strict";
import {
  calcularFactura,
  conceptosDesdeTotal,
  redondear2,
  totalCoincide,
} from "../src/lib/cfdi/calcular";
import { ProveedorMock } from "../src/lib/cfdi/mock";
import { puedeTimbrarCancelar } from "../src/lib/cfdi/permisos";
import { mockFacturaPermitido, obtenerProveedorFactura } from "../src/lib/cfdi/proveedor";
import {
  validarCodigoPostal,
  validarConceptos,
  validarDatosEmisor,
  validarDatosFiscales,
  validarFormaPago,
  validarMetodoPago,
  validarMotivoCancelacion,
  validarRegimenFiscal,
  validarRfc,
  validarUsoCfdi,
} from "../src/lib/cfdi/validar";
import type { DatosTimbrado } from "../src/lib/cfdi/tipos";

assert.equal(validarRfc("XAXX010101000").ok, true);
assert.equal(validarRfc("ABCD010101AB1").ok, true);
assert.equal(validarRfc("XAXX01010100").ok, false, "rechaza RFC de 12 caracteres para persona moral");
assert.equal(validarRfc("XAXX0101010-A").ok, false, "rechaza caracteres inválidos en homoclave");
assert.equal(validarRfc("").ok, false, "rechaza RFC vacío");

assert.equal(validarRegimenFiscal("601").ok, true);
assert.equal(validarRegimenFiscal("999").ok, false, "rechaza régimen inexistente");
assert.equal(validarUsoCfdi("G03").ok, true);
assert.equal(validarUsoCfdi("ZZZZ").ok, false, "rechaza uso de CFDI inexistente");
assert.equal(validarCodigoPostal("06600").ok, true);
assert.equal(validarCodigoPostal("6600").ok, false, "rechaza CP de 4 dígitos");
assert.equal(validarFormaPago("01").ok, true);
assert.equal(validarFormaPago("07").ok, false, "rechaza forma de pago inexistente");
assert.equal(validarMetodoPago("PUE").ok, true);
assert.equal(validarMetodoPago("PPD").ok, true);
assert.equal(validarMetodoPago("XYZ").ok, false, "rechaza método inválido");

const fiscal = validarDatosFiscales({
  rfc: "XAXX010101000",
  razonSocial: "Cliente de prueba",
  regimenFiscal: "601",
  codigoPostal: "06600",
  usoCfdi: "G03",
  correo: "cliente@example.com",
});
assert.equal(fiscal.ok, true);
if (fiscal.ok) {
  assert.equal(fiscal.valor.rfc, "XAXX010101000");
  assert.equal(fiscal.valor.correo, "cliente@example.com");
}
assert.equal(
  validarDatosFiscales({
    rfc: "XAXX010101000",
    razonSocial: "Cliente",
    regimenFiscal: "601",
    codigoPostal: "06600",
    usoCfdi: "G03",
    correo: "no-es-correo",
  }).ok,
  false,
  "rechaza correo inválido",
);

const emisor = validarDatosEmisor({
  rfc: "XAXX010101000",
  razonSocial: "Emisor de prueba",
  regimenFiscal: "601",
  codigoPostal: "06600",
  serie: "A",
  folioSiguiente: 1,
  ambiente: "sandbox",
  proveedor: "mock",
});
assert.equal(emisor.ok, true);

assert.equal(validarMotivoCancelacion("02 - Comprobante emitido con errores sin relación").ok, true);
assert.equal(validarMotivoCancelacion("").ok, false, "exige motivo de cancelación");

const conceptos = validarConceptos([
  { descripcion: "Servicio", cantidad: 1, valorUnitario: 100, ivaTasa: 0.16 },
]);
assert.equal(conceptos.ok, true);
if (conceptos.ok) {
  const calculo = calcularFactura(conceptos.valor);
  assert.equal(calculo.subtotal, 100);
  assert.equal(calculo.impuestos, 16);
  assert.equal(calculo.total, 116);
}
assert.equal(
  validarConceptos([{ descripcion: "", cantidad: 1, valorUnitario: 100 }]).ok,
  false,
  "rechaza descripción vacía",
);
assert.equal(
  validarConceptos([{ descripcion: "Servicio", cantidad: 0, valorUnitario: 100 }]).ok,
  false,
  "rechaza cantidad cero",
);

const desdeTotal = conceptosDesdeTotal(116, "Venta A-1");
assert.equal(desdeTotal.length, 1);
const calculoDesdeTotal = calcularFactura(desdeTotal);
assert.equal(calculoDesdeTotal.subtotal, 100);
assert.equal(calculoDesdeTotal.impuestos, 16);
assert.equal(calculoDesdeTotal.total, 116);
for (const total of [100, 99.99, 1_000_000]) {
  const calculo = calcularFactura(conceptosDesdeTotal(total, `Venta ${total}`));
  assert.equal(calculo.total, total);
  for (const concepto of calculo.conceptos) {
    assert.equal(concepto.ivaTasa, 0.16);
    assert.equal(concepto.iva, redondear2(concepto.importe * 0.16));
  }
}
assert.equal(conceptosDesdeTotal(0, "Nada").length, 0);

const centavo = conceptosDesdeTotal(0.01, "Centavo");
assert.equal(calcularFactura(centavo).total, 0.01);
assert.equal(calcularFactura(centavo).impuestos, 0);
assert.throws(
  () => conceptosDesdeTotal(0.04, "Imposible"),
  /No se pudo desglosar/,
  "documenta el total que no admite IVA 16% exacto con importes de 2 decimales",
);

assert.equal(puedeTimbrarCancelar({ rol: "admin" }), true);
assert.equal(puedeTimbrarCancelar({ puesto: "Finanzas" }), true);
assert.equal(puedeTimbrarCancelar({ puesto: "Cajero" }), false);

assert.equal(redondear2(10.005), 10.01);
assert.equal(totalCoincide(116, 116.01), true);
assert.equal(totalCoincide(116, 116.03), false);

const datos: DatosTimbrado = {
  facturaId: "1",
  serie: "A",
  folio: "1",
  fecha: new Date().toISOString(),
  emisor: {
    rfc: "XAXX010101000",
    razonSocial: "Emisor de prueba",
    regimenFiscal: "601",
    codigoPostal: "06600",
    serie: "A",
    folioSiguiente: 1,
    ambiente: "sandbox",
    proveedor: "mock",
  },
  receptor: {
    rfc: "XAXX010101000",
    razonSocial: "Cliente de prueba",
    regimenFiscal: "601",
    codigoPostal: "06600",
    usoCfdi: "G03",
  },
  conceptos: calculoDesdeTotal.conceptos,
  subtotal: calculoDesdeTotal.subtotal,
  impuestos: calculoDesdeTotal.impuestos,
  retenciones: calculoDesdeTotal.retenciones,
  total: calculoDesdeTotal.total,
  moneda: "MXN",
  formaPago: "01",
  metodoPago: "PUE",
  usoCfdi: "G03",
};

const mock = new ProveedorMock();
const timbrada = await mock.timbrar(datos);
assert.equal(timbrada.uuid.length, 36);
assert.equal(timbrada.estado, "timbrada");
assert.match(timbrada.xml, /<cfdi:Emisor/);
assert.match(timbrada.xml, /<cfdi:Receptor/);
assert.equal(timbrada.pdf[0], 0x25);
assert.equal(timbrada.pdf[1], 0x50);
assert.equal(timbrada.pdf[2], 0x44);
assert.equal(timbrada.pdf[3], 0x46);

const consulta = await mock.consultar(timbrada.uuid);
assert.equal(consulta.estado, "timbrada");
assert.equal(consulta.cancelable, true);
const cancelada = await mock.cancelar(timbrada.uuid, "02 - Errores sin relación");
assert.equal(cancelada.estado, "cancelada");
const xml = await mock.descargar({ uuid: timbrada.uuid, serie: "A", folio: "1" }, "xml");
assert.equal(typeof xml.contenido, "string");
const pdf = await mock.descargar({ uuid: timbrada.uuid, serie: "A", folio: "1" }, "pdf");
assert.ok(pdf.contenido instanceof Uint8Array);

const anterior = process.env.NODE_ENV;
const anteriorMock = process.env.CFDI_PERMITIR_MOCK;
process.env.NODE_ENV = "production";
process.env.CFDI_PERMITIR_MOCK = "0";
assert.equal(mockFacturaPermitido(), false);
assert.throws(() => obtenerProveedorFactura({ proveedor: "mock" }), /bloqueado/);
process.env.CFDI_PERMITIR_MOCK = "1";
assert.equal(mockFacturaPermitido(), true);
assert.ok(obtenerProveedorFactura({ proveedor: "mock" }) instanceof ProveedorMock);
if (anterior === undefined) delete process.env.NODE_ENV;
else process.env.NODE_ENV = anterior;
process.env.CFDI_PERMITIR_MOCK = anteriorMock;

console.log("check:cfdi OK");
