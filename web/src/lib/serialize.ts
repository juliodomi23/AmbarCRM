// Prisma devuelve BigInt y Decimal, que no son serializables por defecto a los
// componentes cliente. Esto los convierte a string/number de forma recursiva.
export function serializar<T>(valor: T): any {
  return JSON.parse(
    JSON.stringify(valor, (_k, v) => {
      if (typeof v === "bigint") return v.toString();
      if (v && typeof v === "object" && v.constructor?.name === "Decimal") return Number(v);
      return v;
    })
  );
}
