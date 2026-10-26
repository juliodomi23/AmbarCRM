import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { desglosarImporte } from "../src/lib/iva-producto";
import { desgloseVenta } from "../src/lib/iva-producto";
import { calcularFactura, conceptosDesdeSnapshots } from "../src/lib/cfdi/calcular";

const incluido = desglosarImporte(new Prisma.Decimal("1500.00"), new Prisma.Decimal("0.16"));
assert.equal(incluido.baseImporte.toFixed(2), "1293.10");
assert.equal(incluido.ivaImporte.toFixed(2), "206.90");

for (const importe of ["0.01", "0.50", "99999.99"]) {
  const desglose = desglosarImporte(new Prisma.Decimal(importe), new Prisma.Decimal("0.16"));
  assert.equal(desglose.baseImporte.plus(desglose.ivaImporte).toFixed(2), importe);
}

const sinImpuesto = desglosarImporte(new Prisma.Decimal("10.00"), new Prisma.Decimal(0));
assert.equal(sinImpuesto.baseImporte.toFixed(2), "10.00");
assert.equal(sinImpuesto.ivaImporte.toFixed(2), "0.00");
const exento = desglosarImporte(new Prisma.Decimal("10.00"), null);
assert.equal(exento.baseImporte.toFixed(2), "10.00");
assert.equal(exento.ivaImporte.toFixed(2), "0.00");
const adicional = desglosarImporte(new Prisma.Decimal("100.00"), new Prisma.Decimal("0.16"), false);
assert.equal(adicional.baseImporte.toFixed(2), "100.00");
assert.equal(adicional.ivaImporte.toFixed(2), "16.00");

const mixto = desgloseVenta([
  { total: new Prisma.Decimal("100.00"), tasa: new Prisma.Decimal("0.16"), exento: false, ivaIncluido: true },
  { total: new Prisma.Decimal("100.00"), tasa: new Prisma.Decimal("0.16"), exento: true, ivaIncluido: true },
  { total: new Prisma.Decimal("100.00"), tasa: new Prisma.Decimal("0"), exento: false, ivaIncluido: true },
], new Prisma.Decimal("30.00"), new Prisma.Decimal("115.00"));
assert.equal(mixto.ivaEnvio.toFixed(2), "15.86");
assert.equal(mixto.ivaTotal.toFixed(2), "28.27");
assert.equal(mixto.partidas[1].ivaExento, true);
assert.equal(mixto.partidas[2].ivaExento, false);

const conceptos = conceptosDesdeSnapshots("385.00", [
  { descripcion: "Gravado", baseImporte: mixto.partidas[0].baseImporte, ivaTasa: mixto.partidas[0].ivaTasa, ivaExento: false },
  { descripcion: "Exento", baseImporte: mixto.partidas[1].baseImporte, ivaTasa: mixto.partidas[1].ivaTasa, ivaExento: true },
  { descripcion: "Tasa 0", baseImporte: mixto.partidas[2].baseImporte, ivaTasa: mixto.partidas[2].ivaTasa, ivaExento: false },
  { descripcion: "Envío", baseImporte: "99.14", ivaTasa: "0.16", ivaExento: false },
]);
assert.equal(calcularFactura(conceptos).total.toFixed(2), "385.00");

process.stdout.write("IVA por producto: cálculos base correctos\n");
