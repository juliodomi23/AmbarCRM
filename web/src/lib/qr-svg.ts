// QR propio (modo byte, corrección M, versiones 1-10 = hasta 213 bytes) para no sumar dependencias.
// ponytail: la máscara se elige con las reglas 1, 2 y 4 de penalización; la regla 3 solo cambiaría qué máscara gana, no si escanea.

const EC_M: Array<{ ecc: number; bloques: Array<[number, number]> }> = [
  { ecc: 10, bloques: [[1, 16]] }, { ecc: 16, bloques: [[1, 28]] }, { ecc: 26, bloques: [[1, 44]] },
  { ecc: 18, bloques: [[2, 32]] }, { ecc: 24, bloques: [[2, 43]] }, { ecc: 16, bloques: [[4, 27]] },
  { ecc: 18, bloques: [[4, 31]] }, { ecc: 22, bloques: [[2, 38], [2, 39]] },
  { ecc: 22, bloques: [[3, 36], [2, 37]] }, { ecc: 26, bloques: [[4, 43], [1, 44]] },
];
const ALINEACION = [[], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const multiplicar = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function divisor(grado: number) {
  const resultado = new Array<number>(grado).fill(0);
  resultado[grado - 1] = 1;
  let raiz = 1;
  for (let i = 0; i < grado; i++) {
    for (let j = 0; j < grado; j++) {
      resultado[j] = multiplicar(resultado[j], raiz);
      if (j + 1 < grado) resultado[j] ^= resultado[j + 1];
    }
    raiz = multiplicar(raiz, 2);
  }
  return resultado;
}

function residuo(datos: number[], div: number[]) {
  const resultado = div.map(() => 0);
  for (const byte of datos) {
    const factor = byte ^ resultado.shift()!;
    resultado.push(0);
    div.forEach((coef, i) => { resultado[i] ^= multiplicar(coef, factor); });
  }
  return resultado;
}

const capacidadDatos = (version: number) => EC_M[version - 1].bloques.reduce((suma, [n, largo]) => suma + n * largo, 0);

function codewords(bytes: Uint8Array, version: number) {
  const { ecc, bloques } = EC_M[version - 1];
  const capacidad = capacidadDatos(version);
  const bits: number[] = [];
  const poner = (valor: number, largo: number) => { for (let i = largo - 1; i >= 0; i--) bits.push((valor >>> i) & 1); };
  poner(0b0100, 4);
  poner(bytes.length, version < 10 ? 8 : 16);
  bytes.forEach((byte) => poner(byte, 8));
  poner(0, Math.min(4, capacidad * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const datos: number[] = [];
  for (let i = 0; i < bits.length; i += 8) datos.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let relleno = 0xec; datos.length < capacidad; relleno ^= 0xec ^ 0x11) datos.push(relleno);

  const div = divisor(ecc);
  const trozos: { datos: number[]; ecc: number[] }[] = [];
  let desde = 0;
  for (const [cantidad, largo] of bloques) {
    for (let i = 0; i < cantidad; i++) {
      const parte = datos.slice(desde, desde + largo);
      desde += largo;
      trozos.push({ datos: parte, ecc: residuo(parte, div) });
    }
  }
  const resultado: number[] = [];
  const mayor = Math.max(...trozos.map((t) => t.datos.length));
  for (let i = 0; i < mayor; i++) for (const t of trozos) if (i < t.datos.length) resultado.push(t.datos[i]);
  for (let i = 0; i < ecc; i++) for (const t of trozos) resultado.push(t.ecc[i]);
  return resultado;
}

const MASCARAS: Array<(x: number, y: number) => boolean> = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function penalizacion(m: boolean[][]) {
  const n = m.length;
  let puntos = 0;
  for (let y = 0; y < n; y++) {
    for (const linea of [m[y], m.map((fila) => fila[y])]) {
      let corrida = 1;
      for (let i = 1; i <= n; i++) {
        if (i < n && linea[i] === linea[i - 1]) corrida++;
        else {
          if (corrida >= 5) puntos += corrida - 2;
          corrida = 1;
        }
      }
    }
  }
  let negras = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (m[y][x]) negras++;
      if (x + 1 < n && y + 1 < n && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) puntos += 3;
    }
  }
  return puntos + Math.floor(Math.abs((negras * 100) / (n * n) - 50) / 5) * 10;
}

/** Matriz de módulos (true = negro) para el texto. Lanza si no cabe en la versión 10. */
export function matrizQr(texto: string) {
  const bytes = new TextEncoder().encode(texto);
  let version = 1;
  while (version <= EC_M.length && 4 + (version < 10 ? 8 : 16) + bytes.length * 8 > capacidadDatos(version) * 8) version++;
  if (version > EC_M.length) throw new Error("El texto es demasiado largo para el QR");

  const n = 17 + version * 4;
  const modulos = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const funcion = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const poner = (x: number, y: number, negro: boolean) => {
    if (x < 0 || y < 0 || x >= n || y >= n) return;
    modulos[y][x] = negro;
    funcion[y][x] = true;
  };
  for (let i = 0; i < n; i++) {
    poner(6, i, i % 2 === 0);
    poner(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const distancia = Math.max(Math.abs(dx), Math.abs(dy));
        poner(cx + dx, cy + dy, distancia !== 2 && distancia !== 4);
      }
    }
  }
  const pos = ALINEACION[version - 1];
  for (const [i, cy] of pos.entries()) {
    for (const [j, cx] of pos.entries()) {
      if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) poner(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }
  const formato = (mascara: number) => {
    const datos = mascara; // nivel de corrección M = 00
    let resto = datos;
    for (let i = 0; i < 10; i++) resto = (resto << 1) ^ ((resto >>> 9) * 0x537);
    const bits = ((datos << 10) | resto) ^ 0x5412;
    const bit = (i: number) => ((bits >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) poner(8, i, bit(i));
    poner(8, 7, bit(6));
    poner(8, 8, bit(7));
    poner(7, 8, bit(8));
    for (let i = 9; i < 15; i++) poner(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) poner(n - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) poner(8, n - 15 + i, bit(i));
    poner(8, n - 8, true);
  };
  formato(0);
  if (version >= 7) {
    let resto = version;
    for (let i = 0; i < 12; i++) resto = (resto << 1) ^ ((resto >>> 11) * 0x1f25);
    const bits = (version << 12) | resto;
    for (let i = 0; i < 18; i++) {
      const negro = ((bits >>> i) & 1) !== 0;
      const a = n - 11 + (i % 3);
      const b = Math.floor(i / 3);
      poner(a, b, negro);
      poner(b, a, negro);
    }
  }

  const datos = codewords(bytes, version);
  let indice = 0;
  for (let derecha = n - 1; derecha >= 1; derecha -= 2) {
    if (derecha === 6) derecha = 5;
    for (let vertical = 0; vertical < n; vertical++) {
      for (let j = 0; j < 2; j++) {
        const x = derecha - j;
        const y = ((derecha + 1) & 2) === 0 ? n - 1 - vertical : vertical;
        if (!funcion[y][x] && indice < datos.length * 8) {
          modulos[y][x] = ((datos[indice >>> 3] >>> (7 - (indice & 7))) & 1) !== 0;
          indice++;
        }
      }
    }
  }

  let mejor: boolean[][] = modulos;
  let mejorPuntos = Infinity;
  for (let mascara = 0; mascara < 8; mascara++) {
    const candidata = modulos.map((fila, y) => fila.map((negro, x) => (!funcion[y][x] && MASCARAS[mascara](x, y) ? !negro : negro)));
    const respaldo = modulos.map((fila) => [...fila]);
    modulos.forEach((fila, y) => fila.forEach((_v, x) => { fila[x] = candidata[y][x]; }));
    formato(mascara);
    const puntos = penalizacion(modulos);
    if (puntos < mejorPuntos) {
      mejorPuntos = puntos;
      mejor = modulos.map((fila) => [...fila]);
    }
    modulos.forEach((fila, y) => fila.forEach((_v, x) => { fila[x] = respaldo[y][x]; }));
  }
  return mejor;
}

/** SVG listo para pintar o imprimir (con 4 módulos de margen blanco). */
export function qrSvg(texto: string, tamano = 240) {
  const m = matrizQr(texto);
  const margen = 4;
  const n = m.length + margen * 2;
  let ruta = "";
  m.forEach((fila, y) => {
    for (let x = 0; x < fila.length; x++) {
      if (!fila[x]) continue;
      let fin = x;
      while (fin + 1 < fila.length && fila[fin + 1]) fin++;
      ruta += `M${x + margen} ${y + margen}h${fin - x + 1}v1h-${fin - x + 1}z`;
      x = fin;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${tamano}" height="${tamano}" shape-rendering="crispEdges" role="img" aria-label="Código QR"><rect width="${n}" height="${n}" fill="#fff"/><path d="${ruta}" fill="#000"/></svg>`;
}
