const PATRONES = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213","221312","231212",
  "112232","122132","122231","113222","123122","123221","223211","221132","221231","213212","223112","312131",
  "311222","321122","321221","312212","322112","322211","212123","212321","232121","111323","131123","131321",
  "112313","132113","132311","211313","231113","231311","112133","112331","132131","113123","113321","133121",
  "313121","211331","231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214","112412","122114",
  "122411","142112","142211","241211","221114","413111","241112","134111","111242","121142","121241","114212",
  "124112","124211","411212","421112","421211","212141","214121","412121","111143","111341","131141","114113",
  "114311","411113","411311","113141","114131","311141","411131","211412","211214","211232","2331112",
] as const;

export function codificarCode128B(codigo: string) {
  if (!codigo || [...codigo].some((caracter) => {
    const valor = caracter.codePointAt(0)!;
    return valor < 32 || valor > 126;
  })) throw new Error("Code 128 B admite únicamente caracteres ASCII imprimibles");
  const valores = [...codigo].map((caracter) => caracter.codePointAt(0)! - 32);
  const checksum = (104 + valores.reduce((suma, valor, indice) => suma + valor * (indice + 1), 0)) % 103;
  return { checksum, simbolos: [104, ...valores, checksum, 106] };
}

function escaparXml(valor: string) {
  return valor.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function svgCode128(codigo: string, opciones: { modulo?: number; alto?: number; texto?: boolean } = {}) {
  const { simbolos } = codificarCode128B(codigo);
  const modulo = Math.max(1, Math.min(8, Math.trunc(opciones.modulo ?? 2)));
  const altoBarras = Math.max(24, Math.min(240, Math.trunc(opciones.alto ?? 64)));
  const mostrarTexto = opciones.texto !== false;
  const quiet = 10;
  const unidades = simbolos.reduce((total, simbolo) => total + [...PATRONES[simbolo]].reduce((suma, ancho) => suma + Number(ancho), 0), quiet * 2);
  const alto = altoBarras + (mostrarTexto ? 22 : 0);
  let x = quiet * modulo;
  const barras: string[] = [];
  for (const simbolo of simbolos) {
    for (const [indice, anchoTexto] of [...PATRONES[simbolo]].entries()) {
      const ancho = Number(anchoTexto) * modulo;
      if (indice % 2 === 0) barras.push(`<rect x="${x}" y="0" width="${ancho}" height="${altoBarras}"/>`);
      x += ancho;
    }
  }
  const texto = mostrarTexto ? `<text x="50%" y="${altoBarras + 16}" text-anchor="middle" font-family="monospace" font-size="14">${escaparXml(codigo)}</text>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Código ${escaparXml(codigo)}" viewBox="0 0 ${unidades * modulo} ${alto}" width="${unidades * modulo}" height="${alto}"><g fill="#000">${barras.join("")}</g>${texto}</svg>`;
}
