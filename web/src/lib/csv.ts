/** Convierte filas a CSV (con escape) y antepone BOM para que Excel lea bien los acentos. */
export function toCSV(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    // Un apóstrofo evita que Excel ejecute como fórmula valores que vienen de clientes
    // (p. ej. un nombre de perfil de WhatsApp que empieza con "=").
    const crudo = v == null ? "" : String(v);
    // Los números (incluidos los negativos, p. ej. un faltante de caja) no son fórmulas.
    const esNumero = /^-\d+(\.\d+)?$/.test(crudo);
    const s = !esNumero && /^[=+\-@\t\r]/.test(crudo) ? `'${crudo}` : crudo;
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cuerpo = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  return "﻿" + cuerpo;
}

/** Parser CSV con comillas escapadas y detección de coma o punto y coma. */
export function parseCSV(text: string): string[][] {
  const cabecera = text.replace(/^\uFEFF/, "").split(/\r?\n/)[0] ?? "";
  const delimitador = cabecera.split(";").length > cabecera.split(",").length ? ";" : ",";
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let enComillas = false;
  for (let indice = text.startsWith("\uFEFF") ? 1 : 0; indice < text.length; indice++) {
    const caracter = text[indice];
    if (enComillas) {
      if (caracter === '"') {
        if (text[indice + 1] === '"') { campo += '"'; indice++; }
        else enComillas = false;
      } else campo += caracter;
    } else if (caracter === '"') enComillas = true;
    else if (caracter === delimitador) { fila.push(campo); campo = ""; }
    else if (caracter === "\n") { fila.push(campo); filas.push(fila); fila = []; campo = ""; }
    else if (caracter !== "\r") campo += caracter;
  }
  if (campo.length > 0 || fila.length > 0) { fila.push(campo); filas.push(fila); }
  return filas;
}

/** Rango de fechas desde query params (YYYY-MM-DD). hasta incluye todo el día. */
export function rangoFechas(desde?: string | null, hasta?: string | null) {
  const f: { gte?: Date; lte?: Date } = {};
  if (desde) f.gte = new Date(`${desde}T00:00:00`);
  if (hasta) f.lte = new Date(`${hasta}T23:59:59`);
  return Object.keys(f).length ? f : undefined;
}

export function respuestaCSV(csv: string, nombre: string) {
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}"`
    }
  });
}
