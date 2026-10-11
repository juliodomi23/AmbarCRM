/**
 * Chrome solo graba audio en WebM y WhatsApp solo acepta notas de voz en Ogg. Ambos llevan Opus,
 * así que basta con cambiar de contenedor: se sacan los paquetes Opus del WebM y se escriben en
 * páginas Ogg (RFC 7845), sin recodificar ni dependencias.
 * ponytail: solo el WebM que produce MediaRecorder (una pista Opus, SimpleBlock sin lacing);
 * cualquier otra cosa lanza error en vez de mandar un audio roto.
 */

const ID = { segmento: 0x18538067, pistas: 0x1654ae6b, pista: 0xae, privado: 0x63a2, audio: 0xe1, canales: 0x9f, cluster: 0x1f43b675, simple: 0xa3, grupo: 0xa0, bloque: 0xa1 };
const CONTENEDORES = new Set([ID.segmento, ID.pistas, ID.pista, ID.audio, ID.cluster, ID.grupo]);

function leerVint(datos: Uint8Array, pos: number, conMarca: boolean) {
  const primero = datos[pos];
  let largo = 1;
  while (largo <= 8 && !(primero & (0x80 >> (largo - 1)))) largo++;
  if (largo > 8 || pos + largo > datos.length) throw new Error("WebM inválido");
  let valor = conMarca ? primero : primero & (0xff >> largo);
  let todosUnos = (primero & (0xff >> largo)) === 0xff >> largo;
  for (let i = 1; i < largo; i++) {
    valor = valor * 256 + datos[pos + i];
    if (datos[pos + i] !== 0xff) todosUnos = false;
  }
  return { valor, largo, desconocido: !conMarca && todosUnos };
}

/** Paquetes Opus, cabecera OpusHead (si viene en CodecPrivate) y número de canales. */
export function paquetesOpusDeWebm(datos: Uint8Array) {
  const paquetes: Uint8Array[] = [];
  let opusHead: Uint8Array | null = null;
  let canales = 1;
  let pos = 0;
  while (pos < datos.length) {
    const id = leerVint(datos, pos, true);
    const tam = leerVint(datos, pos + id.largo, false);
    const inicio = pos + id.largo + tam.largo;
    const fin = tam.desconocido ? datos.length : Math.min(inicio + tam.valor, datos.length);
    if (CONTENEDORES.has(id.valor)) {
      pos = inicio; // se entra al contenedor: sus hijos siguen en orden
      continue;
    }
    const cuerpo = datos.subarray(inicio, fin);
    if (id.valor === ID.privado) opusHead = cuerpo.slice();
    if (id.valor === ID.canales) canales = cuerpo[0] || 1;
    if (id.valor === ID.simple || id.valor === ID.bloque) {
      const pista = leerVint(cuerpo, 0, false);
      const banderas = cuerpo[pista.largo + 2];
      if (banderas & 0x06) throw new Error("WebM con lacing no soportado");
      paquetes.push(cuerpo.slice(pista.largo + 3));
    }
    pos = fin;
  }
  if (paquetes.length === 0) throw new Error("El audio no trae sonido Opus");
  return { paquetes, opusHead, canales };
}

/** Muestras (a 48 kHz) que dura un paquete Opus, según su byte TOC (RFC 6716 §3.1). */
export function muestrasOpus(paquete: Uint8Array) {
  const config = paquete[0] >> 3;
  const ms = config < 12 ? [10, 20, 40, 60][config % 4] : config < 16 ? [10, 20][config % 2] : [2.5, 5, 10, 20][config % 4];
  const codigo = paquete[0] & 3;
  const tramas = codigo === 0 ? 1 : codigo === 3 ? (paquete[1] ?? 0) & 0x3f : 2;
  return ms * 48 * tramas;
}

const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    tabla[i] = r >>> 0;
  }
  return tabla;
})();

export function crcOgg(datos: Uint8Array) {
  let crc = 0;
  for (const byte of datos) crc = ((crc << 8) ^ TABLA_CRC[((crc >>> 24) ^ byte) & 0xff]) >>> 0;
  return crc;
}

function paginaOgg(paquete: Uint8Array, granulo: number, secuencia: number, tipo: number) {
  const segmentos: number[] = [];
  for (let resto = paquete.length; ; resto -= 255) {
    segmentos.push(Math.min(resto, 255));
    if (resto < 255) break;
  }
  if (segmentos.length > 255) throw new Error("Paquete Opus demasiado grande");
  const pagina = new Uint8Array(27 + segmentos.length + paquete.length);
  const vista = new DataView(pagina.buffer);
  pagina.set([0x4f, 0x67, 0x67, 0x53, 0, tipo]); // "OggS", versión 0, tipo de página
  vista.setBigUint64(6, BigInt(granulo), true);
  vista.setUint32(14, 0x414d4252, true); // número de serie fijo: un solo flujo
  vista.setUint32(18, secuencia, true);
  pagina[26] = segmentos.length;
  pagina.set(segmentos, 27);
  pagina.set(paquete, 27 + segmentos.length);
  vista.setUint32(22, crcOgg(pagina), true);
  return pagina;
}

const texto = (s: string) => new TextEncoder().encode(s);

function cabeceraOpus(canales: number) {
  const cabecera = new Uint8Array(19);
  cabecera.set(texto("OpusHead"));
  const vista = new DataView(cabecera.buffer);
  cabecera[8] = 1;
  cabecera[9] = canales;
  vista.setUint16(10, 312, true); // pre-skip típico del codificador
  vista.setUint32(12, 48000, true);
  return cabecera;
}

function etiquetasOpus() {
  const vendedor = texto("AmbarCRM");
  const etiquetas = new Uint8Array(8 + 4 + vendedor.length + 4);
  etiquetas.set(texto("OpusTags"));
  new DataView(etiquetas.buffer).setUint32(8, vendedor.length, true);
  etiquetas.set(vendedor, 12);
  return etiquetas;
}

export function webmAOgg(webm: Uint8Array) {
  const { paquetes, opusHead, canales } = paquetesOpusDeWebm(webm);
  const cabecera = opusHead && texto("OpusHead").every((b, i) => opusHead[i] === b) ? opusHead : cabeceraOpus(canales);
  const paginas = [paginaOgg(cabecera, 0, 0, 0x02), paginaOgg(etiquetasOpus(), 0, 1, 0)];
  let granulo = 0;
  paquetes.forEach((paquete, i) => {
    granulo += muestrasOpus(paquete);
    paginas.push(paginaOgg(paquete, granulo, i + 2, i === paquetes.length - 1 ? 0x04 : 0));
  });
  const salida = new Uint8Array(paginas.reduce((suma, p) => suma + p.length, 0));
  let pos = 0;
  for (const pagina of paginas) {
    salida.set(pagina, pos);
    pos += pagina.length;
  }
  return salida;
}
