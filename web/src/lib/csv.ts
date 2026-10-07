/** Convierte filas a CSV (con escape) y antepone BOM para que Excel lea bien los acentos. */
export function toCSV(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    // Un apóstrofo evita que Excel ejecute como fórmula valores que vienen de clientes
    // (p. ej. un nombre de perfil de WhatsApp que empieza con "=").
    const crudo = v == null ? "" : String(v);
    const s = /^[=+\-@\t\r]/.test(crudo) ? `'${crudo}` : crudo;
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const cuerpo = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  return "﻿" + cuerpo;
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
