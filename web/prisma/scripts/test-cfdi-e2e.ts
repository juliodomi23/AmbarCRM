import assert from "node:assert/strict";
import pg from "pg";

const appUrl = process.env.DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
for (const valor of [appUrl, adminUrl]) {
  if (!valor) throw new Error("Define DATABASE_URL y ADMIN_DATABASE_URL para PostgreSQL aislado");
  const url = new URL(valor);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/cfdi_test") {
    throw new Error("La prueba solo admite localhost/cfdi_test");
  }
}
process.env.CFDI_PERMITIR_MOCK = "1";
process.env.CFDI_PROVEEDOR = "mock";

const { db, dbRaw, runWithOrg } = await import("../../src/lib/db");
const { cancelarFactura, crearFactura, descargarFactura, guardarEmisor, obtenerFactura, timbrarFactura } =
  await import("../../src/lib/cfdi/servicio");

const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
const orgA = 93n;
const orgB = 94n;
const orgsPrueba = ["93", "94"];

async function limpiarOrgs() {
  await admin.query("DELETE FROM eventos_factura WHERE org_id = ANY($1::bigint[])", [orgsPrueba]);
  await admin.query("DELETE FROM conceptos_factura WHERE org_id = ANY($1::bigint[])", [orgsPrueba]);
  await admin.query("DELETE FROM facturas WHERE org_id = ANY($1::bigint[])", [orgsPrueba]);
  await admin.query("DELETE FROM datos_fiscales WHERE org_id = ANY($1::bigint[])", [orgsPrueba]);
  await admin.query("DELETE FROM pagos_online WHERE org_id = ANY($1::bigint[])", [orgsPrueba]);
  await admin.query("DELETE FROM ventas WHERE org_id = ANY($1::bigint[])", [orgsPrueba]);
  await admin.query("DELETE FROM contactos WHERE org_id = ANY($1::bigint[])", [orgsPrueba]);
  await admin.query("DELETE FROM modulos_org WHERE org_id = ANY($1::bigint[])", [orgsPrueba]);
  await admin.query("DELETE FROM datos_emisor WHERE org_id = ANY($1::bigint[])", [orgsPrueba]);
  await admin.query("DELETE FROM orgs WHERE id = ANY($1::bigint[])", [orgsPrueba]);
}

async function main() {
  await limpiarOrgs();
  await admin.query(
    "INSERT INTO orgs (id,nombre,slug) VALUES (93,'CFDI A','cfdi-a'),(94,'CFDI B','cfdi-b')",
  );

  const ventaA = await runWithOrg(orgA, async () => {
    await db.moduloOrg.create({ data: { clave: "facturacion", activo: true } });
    await db.datosEmisor.create({
      data: {
        rfc: "XAXX010101000",
        razonSocial: "Emisor CFDI A",
        regimenFiscal: "601",
        codigoPostal: "06600",
        serie: "A",
        folioSiguiente: 1,
        ambiente: "sandbox",
        proveedor: "mock",
      },
    });
    const contacto = await db.contacto.create({ data: { nombre: "Cliente CFDI A" } });
    await db.datosFiscales.create({
      data: {
        contactoId: contacto.id,
        rfc: "XAXX010101000",
        razonSocial: "Cliente CFDI A",
        regimenFiscal: "601",
        codigoPostal: "06600",
        usoCfdi: "G03",
        correo: "cfdi-a@example.com",
      },
    });
    return db.venta.create({
      data: {
        folio: "V-CFDI-1",
        contactoId: contacto.id,
        subtotal: "116.00",
        total: "116.00",
        moneda: "MXN",
        estado: "pagada",
      },
    });
  });

  const primera = await runWithOrg(orgA, () =>
    crearFactura(orgA, {
      ventaId: ventaA.id.toString(),
      idempotencyKey: "cfdi-e2e-1",
      timbrar: true,
    }),
  );
  assert.equal(primera.duplicado, false);
  assert.equal(primera.factura.estado, "timbrada");
  assert.ok(primera.factura.uuid);
  assert.equal(Number(primera.factura.subtotal), 100);
  assert.equal(Number(primera.factura.impuestos), 16);
  assert.equal(Number(primera.factura.total), 116);
  assert.equal(primera.factura.conceptos.length, 1);
  assert.equal(primera.factura.receptorRfc, "XAXX010101000");
  assert.equal(primera.factura.receptorRazonSocial, "Cliente CFDI A");
  assert.equal(primera.factura.emisorRfc, "XAXX010101000");
  assert.equal(primera.factura.emisorRazonSocial, "Emisor CFDI A");
  assert.equal("xml" in primera.factura, false, "crearFactura/timbrarFactura no exponen el XML");
  assert.equal("pdf" in primera.factura, false, "crearFactura/timbrarFactura no exponen el PDF");

  const sinArchivos = await runWithOrg(orgA, () => obtenerFactura(primera.factura.id));
  assert.ok(sinArchivos);
  assert.equal("xml" in sinArchivos, false, "obtenerFactura no expone el XML");
  assert.equal("pdf" in sinArchivos, false, "obtenerFactura no expone el PDF");

  const guardada = await runWithOrg(orgA, () =>
    db.factura.findFirst({
      where: { id: primera.factura.id },
      select: { xml: true, pdf: true },
    }),
  );
  assert.match(guardada?.xml ?? "", /<cfdi:Emisor/);
  assert.ok(guardada?.xml?.includes(primera.factura.uuid ?? ""));
  assert.ok(guardada?.pdf && guardada.pdf.length > 0);

  const repetida = await runWithOrg(orgA, () =>
    crearFactura(orgA, {
      ventaId: ventaA.id.toString(),
      idempotencyKey: "cfdi-e2e-1",
      timbrar: true,
    }),
  );
  assert.equal(repetida.duplicado, true);
  assert.equal(repetida.factura.id, primera.factura.id);

  const porOrigen = await runWithOrg(orgA, () =>
    crearFactura(orgA, {
      ventaId: ventaA.id.toString(),
      idempotencyKey: "cfdi-e2e-2",
      timbrar: true,
    }),
  );
  assert.equal(porOrigen.duplicado, true);
  assert.equal(porOrigen.factura.id, primera.factura.id);

  const ajeno = await runWithOrg(orgB, () => obtenerFactura(primera.factura.id));
  assert.equal(ajeno, null, "RLS impide leer la factura de otra org");
  const ajenas = await runWithOrg(orgB, () => db.factura.findMany());
  assert.equal(ajenas.length, 0, "RLS aísla el listado de facturas");

  await runWithOrg(orgA, () =>
    db.datosFiscales.update({
      where: { orgId_contactoId: { orgId: orgA, contactoId: ventaA.contactoId! } },
      data: { rfc: "ABCD010101AB1" },
    }),
  );
  const inmutable = await runWithOrg(orgA, () => obtenerFactura(primera.factura.id));
  assert.equal(inmutable?.receptorRfc, "XAXX010101000", "el snapshot no cambia con datos fiscales nuevos");

  await runWithOrg(orgA, () =>
    guardarEmisor(orgA, {
      rfc: "BBB010101BB1",
      razonSocial: "Emisor CFDI A actualizado",
      regimenFiscal: "601",
      codigoPostal: "06700",
      serie: "A",
      folioSiguiente: 2,
      ambiente: "sandbox",
      proveedor: "mock",
    }),
  );
  const inmutableEmisor = await runWithOrg(orgA, () => obtenerFactura(primera.factura.id));
  assert.equal(inmutableEmisor?.emisorRfc, "XAXX010101000", "el snapshot del emisor no cambia");
  assert.equal(inmutableEmisor?.emisorRazonSocial, "Emisor CFDI A");

  await assert.rejects(
    () =>
      runWithOrg(orgA, () =>
        guardarEmisor(orgA, {
          rfc: "XAXX010101000",
          razonSocial: "Emisor CFDI A",
          regimenFiscal: "601",
          codigoPostal: "06600",
          serie: "A",
          folioSiguiente: 1,
          ambiente: "sandbox",
          proveedor: "mock",
        }),
      ),
    /folio siguiente debe ser mayor/,
  );

  const ventaCien = await runWithOrg(orgA, async () => {
    const contacto = await db.contacto.create({ data: { nombre: "Cliente cien" } });
    await db.datosFiscales.create({
      data: {
        contactoId: contacto.id,
        rfc: "XAXX010101000",
        razonSocial: "Cliente cien",
        regimenFiscal: "601",
        codigoPostal: "06600",
        usoCfdi: "G03",
      },
    });
    return db.venta.create({
      data: {
        folio: "V-CFDI-100",
        contactoId: contacto.id,
        subtotal: "100.00",
        total: "100.00",
        moneda: "MXN",
        estado: "pagada",
      },
    });
  });
  const facturaCien = await runWithOrg(orgA, () =>
    crearFactura(orgA, {
      ventaId: ventaCien.id.toString(),
      idempotencyKey: "cfdi-e2e-100",
      timbrar: true,
    }),
  );
  assert.equal(facturaCien.factura.estado, "timbrada");
  assert.equal(Number(facturaCien.factura.subtotal), 86.21);
  assert.equal(Number(facturaCien.factura.impuestos), 13.79);
  assert.equal(Number(facturaCien.factura.total), 100);
  assert.equal(Number(facturaCien.factura.conceptos[0]?.ivaTasa), 0.16);
  const xmlCien = await runWithOrg(orgA, () => descargarFactura(orgA, facturaCien.factura.id, "xml"));
  const xmlCienTexto = String(xmlCien.contenido);
  assert.equal(
    [...xmlCienTexto.matchAll(/TasaOCuota="0\.160000"/gu)].length,
    2,
    "el concepto y el total conservan la tasa exacta",
  );
  assert.doesNotMatch(xmlCienTexto, /0\.159961/u);

  const ventaCasiCien = await runWithOrg(orgA, async () => {
    const contacto = await db.contacto.create({ data: { nombre: "Cliente casi cien" } });
    await db.datosFiscales.create({
      data: {
        contactoId: contacto.id,
        rfc: "XAXX010101000",
        razonSocial: "Cliente casi cien",
        regimenFiscal: "601",
        codigoPostal: "06600",
        usoCfdi: "G03",
      },
    });
    return db.venta.create({
      data: {
        folio: "V-CFDI-99-99",
        contactoId: contacto.id,
        subtotal: "99.99",
        total: "99.99",
        moneda: "MXN",
        estado: "pagada",
      },
    });
  });
  const facturaCasiCien = await runWithOrg(orgA, () =>
    crearFactura(orgA, {
      ventaId: ventaCasiCien.id.toString(),
      idempotencyKey: "cfdi-e2e-99-99",
      timbrar: true,
    }),
  );
  assert.equal(Number(facturaCasiCien.factura.total), 99.99);
  assert.equal(Number(facturaCasiCien.factura.conceptos[0]?.ivaTasa), 0.16);
  const xmlCasiCien = await runWithOrg(orgA, () => descargarFactura(orgA, facturaCasiCien.factura.id, "xml"));
  const xmlCasiCienTexto = String(xmlCasiCien.contenido);
  assert.equal(
    [...xmlCasiCienTexto.matchAll(/TasaOCuota="0\.160000"/gu)].length,
    2,
    "99.99 también conserva la tasa exacta",
  );

  const xml = await runWithOrg(orgA, () => descargarFactura(orgA, primera.factura.id, "xml"));
  assert.match(String(xml.contenido), /<cfdi:Emisor/);
  const pdf = await runWithOrg(orgA, () => descargarFactura(orgA, primera.factura.id, "pdf"));
  assert.ok(pdf.contenido instanceof Uint8Array);
  assert.equal(String(xml.contenido), guardada?.xml);
  assert.ok(Buffer.from(pdf.contenido).equals(Buffer.from(guardada!.pdf!)));
  const xmlOtraVez = await runWithOrg(orgA, () => descargarFactura(orgA, primera.factura.id, "xml"));
  const pdfOtraVez = await runWithOrg(orgA, () => descargarFactura(orgA, primera.factura.id, "pdf"));
  assert.equal(String(xmlOtraVez.contenido), String(xml.contenido));
  assert.ok(Buffer.from(pdfOtraVez.contenido).equals(Buffer.from(pdf.contenido)));

  const pago = await runWithOrg(orgA, () =>
    db.pagoOnline.create({
      data: {
        origenTipo: "venta",
        origenId: ventaA.id,
        proveedor: "mock",
        estado: "aprobado",
        monto: "58.00",
        moneda: "MXN",
        idempotencyKey: "cfdi-e2e-pago",
        referenciaExterna: "P-CFDI-1",
      },
    }),
  );
  const facturaPago = await runWithOrg(orgA, () =>
    crearFactura(orgA, {
      pagoId: pago.id.toString(),
      idempotencyKey: "cfdi-e2e-pago-factura",
      timbrar: true,
    }),
  );
  assert.equal(facturaPago.factura.estado, "timbrada");
  assert.equal(Number(facturaPago.factura.total), 58);
  assert.equal(facturaPago.factura.receptorRfc, "ABCD010101AB1");
  assert.ok(facturaPago.factura.uuid);

  const ventaStale = await runWithOrg(orgA, async () => {
    const contacto = await db.contacto.create({ data: { nombre: "Cliente stale" } });
    await db.datosFiscales.create({
      data: {
        contactoId: contacto.id,
        rfc: "XAXX010101000",
        razonSocial: "Cliente stale",
        regimenFiscal: "601",
        codigoPostal: "06600",
        usoCfdi: "G03",
      },
    });
    return db.venta.create({
      data: {
        folio: "V-CFDI-STALE",
        contactoId: contacto.id,
        subtotal: "116.00",
        total: "116.00",
        moneda: "MXN",
        estado: "pagada",
      },
    });
  });
  const borrador = await runWithOrg(orgA, () =>
    crearFactura(orgA, {
      ventaId: ventaStale.id.toString(),
      idempotencyKey: "cfdi-e2e-stale",
      timbrar: false,
    }),
  );
  await runWithOrg(orgA, () =>
    db.factura.update({
      where: { id: borrador.factura.id },
      data: { estado: "timbrando", timbrandoAt: new Date(Date.now() - 11 * 60 * 1000) },
    }),
  );
  const recuperada = await runWithOrg(orgA, () => timbrarFactura(orgA, borrador.factura.id));
  assert.equal(recuperada.estado, "timbrada", "reclama un timbrado viejo de más de 10 minutos");

  const ventaConcurrente = await runWithOrg(orgA, async () => {
    const contacto = await db.contacto.create({ data: { nombre: "Cliente concurrente" } });
    await db.datosFiscales.create({
      data: {
        contactoId: contacto.id,
        rfc: "XAXX010101000",
        razonSocial: "Cliente concurrente",
        regimenFiscal: "601",
        codigoPostal: "06600",
        usoCfdi: "G03",
      },
    });
    return db.venta.create({
      data: {
        folio: "V-CFDI-CONC",
        contactoId: contacto.id,
        subtotal: "116.00",
        total: "116.00",
        moneda: "MXN",
        estado: "pagada",
      },
    });
  });
  const borradorConcurrente = await runWithOrg(orgA, () =>
    crearFactura(orgA, {
      ventaId: ventaConcurrente.id.toString(),
      idempotencyKey: "cfdi-e2e-conc",
      timbrar: false,
    }),
  );
  const intentos = await Promise.allSettled([
    runWithOrg(orgA, () => timbrarFactura(orgA, borradorConcurrente.factura.id)),
    runWithOrg(orgA, () => timbrarFactura(orgA, borradorConcurrente.factura.id)),
  ]);
  const exitosos = intentos.flatMap((intento) =>
    intento.status === "fulfilled" ? [intento.value] : [],
  );
  assert.ok(exitosos.length >= 1);
  assert.equal(new Set(exitosos.map((factura) => factura.uuid)).size, 1, "un solo UUID");
  assert.equal(new Set(exitosos.map((factura) => factura.folio)).size, 1, "un solo folio");
  const finalConcurrente = await runWithOrg(orgA, () => obtenerFactura(borradorConcurrente.factura.id));
  assert.equal(finalConcurrente?.estado, "timbrada");
  assert.equal(finalConcurrente?.uuid, exitosos[0].uuid);
  assert.equal(finalConcurrente?.folio, exitosos[0].folio);
  assert.notEqual(finalConcurrente?.folio, primera.factura.folio);
  assert.notEqual(finalConcurrente?.folio, recuperada.folio);

  const cancelada = await runWithOrg(orgA, () =>
    cancelarFactura(orgA, primera.factura.id, "02 - Comprobante emitido con errores sin relación"),
  );
  assert.equal(cancelada.estado, "cancelada");
  assert.ok(cancelada.canceladaAt);
  assert.equal("xml" in cancelada, false, "cancelarFactura no expone el XML");
  assert.equal("pdf" in cancelada, false, "cancelarFactura no expone el PDF");
  const xmlCancelada = await runWithOrg(orgA, () => descargarFactura(orgA, primera.factura.id, "xml"));
  assert.equal(String(xmlCancelada.contenido), guardada?.xml, "el XML guardado no se regenera");

  await admin.query("UPDATE facturas SET xml = NULL, pdf = NULL WHERE id = $1", [
    primera.factura.id.toString(),
  ]);
  await assert.rejects(
    () => runWithOrg(orgA, () => descargarFactura(orgA, primera.factura.id, "xml")),
    /no tiene XML guardado/,
  );

  const eventos = await runWithOrg(orgA, () =>
    db.eventoFactura.findMany({ where: { facturaId: primera.factura.id } }),
  );
  assert.deepEqual(
    eventos.map((evento) => evento.tipo).sort(),
    ["cancelada", "creada", "timbrada"],
  );

  await limpiarOrgs();
  console.log("test-cfdi-e2e OK");
}

try {
  await main();
} finally {
  await dbRaw.$disconnect();
  await admin.end();
}
