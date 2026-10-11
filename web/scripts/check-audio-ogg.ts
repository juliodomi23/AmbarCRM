// WebM/Opus (lo único que graba Chrome) → Ogg/Opus (lo que acepta WhatsApp como nota de voz).
// Validado además contra ffmpeg con audio real: ffprobe lo lee como ogg/opus y decodifica sin errores.
import assert from "node:assert/strict";
import { crcOgg, muestrasOpus, paquetesOpusDeWebm, webmAOgg } from "../src/lib/audio/webm-a-ogg.ts";

const bytes = (...partes: (number[] | Uint8Array)[]) => Uint8Array.from(partes.flatMap((p) => [...p]));
const tam = (n: number) => (n < 127 ? [0x80 | n] : [0x40 | (n >> 8), n & 0xff]); // tamaño EBML de 1 o 2 bytes
const DESCONOCIDO = [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];

const opusHead = bytes([..."OpusHead"].map((c) => c.charCodeAt(0)), [1, 1, 0x38, 0x01, 0x80, 0xbb, 0, 0, 0, 0, 0]);
const trama = (relleno: number) => bytes([0x98], new Array(relleno).fill(7)); // TOC config 19 (CELT 20 ms), 1 trama
const bloque = (relleno: number) => {
  const cuerpo = bytes([0x81, 0, 0, 0x80], trama(relleno)); // pista 1, tiempo 0, keyframe sin lacing
  return bytes([0xa3], tam(cuerpo.length), cuerpo);
};
const pista = bytes([0xae], tam(opusHead.length + 3), [0x63, 0xa2], tam(opusHead.length), opusHead);
const webm = bytes(
  [0x1a, 0x45, 0xdf, 0xa3], tam(0), // cabecera EBML vacía
  [0x18, 0x53, 0x80, 0x67], DESCONOCIDO, // Segment de tamaño desconocido, como MediaRecorder
  [0x16, 0x54, 0xae, 0x6b], tam(pista.length), pista,
  [0x1f, 0x43, 0xb6, 0x75], DESCONOCIDO,
  [0xe7], tam(1), [0],
  bloque(40), bloque(300), bloque(10),
);

const { paquetes, opusHead: head } = paquetesOpusDeWebm(webm);
assert.equal(paquetes.length, 3);
assert.deepEqual([...head!], [...opusHead], "usa el OpusHead del CodecPrivate");
assert.equal(muestrasOpus(trama(1)), 960, "20 ms a 48 kHz");
assert.equal(muestrasOpus(bytes([0x03, 0x02])), 2 * 480, "código 3: 2 tramas de 10 ms (SILK)");

const ogg = webmAOgg(webm);
const paginas: { tipo: number; granulo: bigint; secuencia: number }[] = [];
for (let pos = 0; pos < ogg.length;) {
  const vista = new DataView(ogg.buffer, ogg.byteOffset + pos);
  assert.equal(String.fromCharCode(...ogg.subarray(pos, pos + 4)), "OggS");
  const segmentos = ogg[pos + 26];
  const largo = 27 + segmentos + ogg.subarray(pos + 27, pos + 27 + segmentos).reduce((a, b) => a + b, 0);
  const pagina = ogg.slice(pos, pos + largo);
  const crc = vista.getUint32(22, true);
  pagina.fill(0, 22, 26);
  assert.equal(crcOgg(pagina), crc, "CRC de la página");
  paginas.push({ tipo: ogg[pos + 5], granulo: vista.getBigUint64(6, true), secuencia: vista.getUint32(18, true) });
  pos += largo;
}
assert.equal(paginas.length, 5, "OpusHead + OpusTags + 3 paquetes");
assert.equal(paginas[0].tipo, 0x02, "la primera página marca inicio");
assert.equal(paginas[4].tipo, 0x04, "la última página marca fin");
assert.equal(paginas[4].granulo, 2880n, "3 paquetes × 960 muestras");
assert.deepEqual(paginas.map((p) => p.secuencia), [0, 1, 2, 3, 4]);
assert.throws(() => paquetesOpusDeWebm(bytes([0x1a, 0x45, 0xdf, 0xa3], tam(0))), /sonido Opus/);
console.log("audio: WebM/Opus → Ogg/Opus con CRC, duración y marcas correctas");
