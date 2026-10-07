export type DefinicionCampo = {
  clave: string;
  tipo: "texto" | "numero" | "fecha" | "opcion" | "si_no";
  opciones: unknown;
  obligatorio: boolean;
  activo: boolean;
};

/** Valida únicamente claves definidas: protege datos históricos y descarta entradas ajenas. */
export function validarCampos(
  definiciones: DefinicionCampo[],
  entrada: unknown,
) {
  const origen =
    entrada && typeof entrada === "object" && !Array.isArray(entrada)
      ? (entrada as Record<string, unknown>)
      : {};
  const campos: Record<string, string | number | boolean> = {};
  const errores: string[] = [];
  for (const def of definiciones.filter((d) => d.activo)) {
    const valor = origen[def.clave];
    if (valor == null || valor === "") {
      if (def.obligatorio) errores.push(`${def.clave} es obligatorio`);
      continue;
    }
    if (def.tipo === "texto" && typeof valor === "string")
      campos[def.clave] = valor.trim();
    else if (
      def.tipo === "numero" &&
      typeof valor === "number" &&
      Number.isFinite(valor)
    )
      campos[def.clave] = valor;
    else if (
      def.tipo === "fecha" &&
      typeof valor === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(valor)
    )
      campos[def.clave] = valor;
    else if (def.tipo === "si_no" && typeof valor === "boolean")
      campos[def.clave] = valor;
    else if (
      def.tipo === "opcion" &&
      typeof valor === "string" &&
      Array.isArray(def.opciones) &&
      def.opciones.includes(valor)
    )
      campos[def.clave] = valor;
    else errores.push(`${def.clave} no es válido`);
  }
  return { campos, errores };
}
