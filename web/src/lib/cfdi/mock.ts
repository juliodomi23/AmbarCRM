import { randomUUID } from "node:crypto";
import { ErrorCfdi } from "./errores";
import type {
  ArchivoFactura,
  ConsultaFactura,
  DatosDescarga,
  DatosTimbrado,
  FormatoFactura,
  ProveedorFactura,
  ResultadoCancelacion,
  ResultadoTimbrado,
} from "./tipos";
import { Prisma } from "@prisma/client";

function escaparXml(valor: string) {
  return valor
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

function dinero(valor: number) {
  return valor.toFixed(2);
}

export function generarXmlMock(datos: DatosTimbrado, uuid: string) {
  const gruposImpuesto = new Map<string, { base: Prisma.Decimal; iva: Prisma.Decimal; tasa: number; exento: boolean }>();
  for (const concepto of datos.conceptos) {
    const clave = concepto.ivaExento ? "exento" : concepto.ivaTasa.toFixed(6);
    const grupo = gruposImpuesto.get(clave) ?? { base: new Prisma.Decimal(0), iva: new Prisma.Decimal(0), tasa: concepto.ivaTasa, exento: concepto.ivaExento === true };
    grupo.base = grupo.base.plus(concepto.importe);
    grupo.iva = grupo.iva.plus(concepto.iva);
    gruposImpuesto.set(clave, grupo);
  }
  const conceptos = datos.conceptos
    .map((concepto) => {
      const traslado = concepto.ivaExento
        ? `<cfdi:Traslado Base="${dinero(concepto.importe)}" Impuesto="002" TipoFactor="Exento"/>`
        : `<cfdi:Traslado Base="${dinero(concepto.importe)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="${concepto.ivaTasa.toFixed(6)}" Importe="${dinero(concepto.iva)}"/>`;
      return `    <cfdi:Concepto ClaveProdServ="${escaparXml(concepto.claveProdServ ?? "01010101")}" Cantidad="${concepto.cantidad}" ClaveUnidad="${escaparXml(concepto.claveUnidad ?? "E48")}" Descripcion="${escaparXml(concepto.descripcion)}" ValorUnitario="${dinero(concepto.valorUnitario)}" Importe="${dinero(concepto.importe)}" ObjetoImp="02">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          ${traslado}
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>`;
    })
    .join("\n");
  const traslados = [...gruposImpuesto.values()].map((grupo) => grupo.exento
    ? `<cfdi:Traslado Base="${dinero(grupo.base.toNumber())}" Impuesto="002" TipoFactor="Exento"/>`
    : `<cfdi:Traslado Base="${dinero(grupo.base.toNumber())}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="${grupo.tasa.toFixed(6)}" Importe="${dinero(grupo.iva.toNumber())}"/>`).join("\n      ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- XML de ejemplo generado por ProveedorMock. No es un CFDI válido ante el SAT. -->
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Serie="${escaparXml(datos.serie)}" Folio="${escaparXml(datos.folio)}" Fecha="${escaparXml(datos.fecha)}" SubTotal="${dinero(datos.subtotal)}" Total="${dinero(datos.total)}" Moneda="${escaparXml(datos.moneda)}" TipoDeComprobante="I" Exportacion="01" MetodoPago="${escaparXml(datos.metodoPago)}" FormaPago="${escaparXml(datos.formaPago)}" LugarExpedicion="${escaparXml(datos.emisor.codigoPostal)}" NoCertificado="MOCK" Sello="MOCK">
  <cfdi:Emisor Rfc="${escaparXml(datos.emisor.rfc)}" Nombre="${escaparXml(datos.emisor.razonSocial)}" RegimenFiscal="${escaparXml(datos.emisor.regimenFiscal)}"/>
  <cfdi:Receptor Rfc="${escaparXml(datos.receptor.rfc)}" Nombre="${escaparXml(datos.receptor.razonSocial)}" UsoCFDI="${escaparXml(datos.usoCfdi)}" DomicilioFiscalReceptor="${escaparXml(datos.receptor.codigoPostal)}" RegimenFiscalReceptor="${escaparXml(datos.receptor.regimenFiscal)}"/>
  <cfdi:Conceptos>
${conceptos}
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="${dinero(datos.impuestos)}">
    <cfdi:Traslados>
      ${traslados}
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="${escaparXml(uuid)}" FechaTimbrado="${escaparXml(datos.fecha)}" NoCertificadoSAT="MOCK" SelloSAT="MOCK"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;
}

function asciiPdf(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^\x20-\x7e]/gu, "?")
    .replace(/\\/gu, "\\\\")
    .replace(/\(/gu, "\\(")
    .replace(/\)/gu, "\\)");
}

export function generarPdfMock(titulo: string, lineas: string[]): Uint8Array {
  const contenido = [
    "BT",
    "/F1 14 Tf",
    "50 800 Td",
    `(${asciiPdf(titulo)}) Tj`,
    "/F1 10 Tf",
    ...lineas.flatMap((linea) => ["0 -18 Td", `(${asciiPdf(linea)}) Tj`]),
    "ET",
  ].join("\n");

  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(contenido, "latin1")} >>\nstream\n${contenido}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const desplazamientos: number[] = [];
  objetos.forEach((objeto, indice) => {
    desplazamientos.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${indice + 1} 0 obj\n${objeto}\nendobj\n`;
  });

  const inicioXref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const desplazamiento of desplazamientos) {
    pdf += `${String(desplazamiento).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}

function nombreArchivo(datos: DatosDescarga, formato: FormatoFactura) {
  const base = [datos.serie ?? "A", datos.folio ?? datos.uuid].filter(Boolean).join("-");
  return `factura-${base}.${formato}`;
}

export class ProveedorMock implements ProveedorFactura {
  async timbrar(datos: DatosTimbrado): Promise<ResultadoTimbrado> {
    const uuid = randomUUID().toUpperCase();
    const fechaTimbrado = new Date().toISOString();
    const xml = generarXmlMock(datos, uuid);
    const pdf = generarPdfMock(`Factura ${datos.serie}-${datos.folio}`, [
      `UUID (mock): ${uuid}`,
      `Emisor: ${datos.emisor.razonSocial} (${datos.emisor.rfc})`,
      `Receptor: ${datos.receptor.razonSocial} (${datos.receptor.rfc})`,
      `Subtotal: ${dinero(datos.subtotal)} ${datos.moneda}`,
      `IVA: ${dinero(datos.impuestos)} ${datos.moneda}`,
      `Total: ${dinero(datos.total)} ${datos.moneda}`,
      "",
      "Documento de ejemplo generado por ProveedorMock.",
      "No es un CFDI valido ante el SAT.",
    ]);
    return {
      uuid,
      serie: datos.serie,
      folio: datos.folio,
      estado: "timbrada",
      fechaTimbrado,
      xml,
      pdf,
    };
  }

  async consultar(uuid: string): Promise<ConsultaFactura> {
    if (!uuid) throw new ErrorCfdi("UUID inválido", 400);
    return { uuid, estado: "timbrada", cancelable: true };
  }

  async cancelar(uuid: string, motivo: string): Promise<ResultadoCancelacion> {
    if (!uuid) throw new ErrorCfdi("UUID inválido", 400);
    if (!motivo.trim()) throw new ErrorCfdi("El motivo de cancelación es obligatorio", 400);
    return { estado: "cancelada", fechaCancelacion: new Date().toISOString() };
  }

  async descargar(datos: DatosDescarga, formato: FormatoFactura): Promise<ArchivoFactura> {
    if (formato === "xml") {
      return {
        contenido: generarXmlMock({
          facturaId: "mock",
          serie: datos.serie ?? "A",
          folio: datos.folio ?? datos.uuid,
          fecha: datos.fecha ?? new Date().toISOString(),
          emisor: {
            rfc: datos.rfcEmisor ?? "XAXX010101000",
            razonSocial: datos.nombreEmisor ?? "Emisor de ejemplo",
            regimenFiscal: "601",
            codigoPostal: "00000",
            serie: datos.serie ?? "A",
            folioSiguiente: 1,
            ambiente: "sandbox",
            proveedor: "mock",
          },
          receptor: {
            rfc: datos.rfcReceptor ?? "XAXX010101000",
            razonSocial: datos.nombreReceptor ?? "Receptor de ejemplo",
            regimenFiscal: "601",
            codigoPostal: "00000",
            usoCfdi: "G03",
          },
          conceptos: [{
            descripcion: "Documento de ejemplo",
            cantidad: 1,
            valorUnitario: Number(datos.total ?? 0),
            ivaTasa: 0,
            retencionTasa: 0,
            importe: Number(datos.total ?? 0),
            iva: 0,
            retenciones: 0,
          }],
          subtotal: Number(datos.total ?? 0),
          impuestos: 0,
          retenciones: 0,
          total: Number(datos.total ?? 0),
          moneda: datos.moneda ?? "MXN",
          formaPago: "99",
          metodoPago: "PUE",
          usoCfdi: "G03",
        }, datos.uuid),
        tipoContenido: "application/xml; charset=utf-8",
        nombre: nombreArchivo(datos, "xml"),
      };
    }

    return {
      contenido: generarPdfMock(`Factura ${datos.serie ?? "A"}-${datos.folio ?? datos.uuid}`, [
        `UUID (mock): ${datos.uuid}`,
        `Emisor: ${datos.nombreEmisor ?? "Emisor de ejemplo"} (${datos.rfcEmisor ?? "XAXX010101000"})`,
        `Receptor: ${datos.nombreReceptor ?? "Receptor de ejemplo"} (${datos.rfcReceptor ?? "XAXX010101000"})`,
        `Total: ${datos.total ?? "0.00"} ${datos.moneda ?? "MXN"}`,
        "",
        "Documento de ejemplo generado por ProveedorMock.",
        "No es un CFDI valido ante el SAT.",
      ]),
      tipoContenido: "application/pdf",
      nombre: nombreArchivo(datos, "pdf"),
    };
  }
}
