import { dbRaw, orgActual } from "@/lib/db";
import { patronLike } from "@/lib/patron-like";

/**
 * Ids de contactos de la empresa actual cuyo nombre, teléfono o empresa contiene `q`,
 * sin importar acentos ni mayúsculas («monica» encuentra «Mónica»). La empresa se fija en
 * la misma transacción, así que RLS aplica igual que en el resto del CRM.
 * ponytail: sin índice (ILIKE con unaccent recorre la tabla); con cientos de miles de
 * contactos, agregar un índice trigram sobre un unaccent inmutable.
 */
export async function contactosQueCoinciden(q: string, limite: number): Promise<bigint[]> {
  const org = await orgActual();
  if (org == null) return [];
  const patron = patronLike(q);
  const [, filas] = await dbRaw.$transaction([
    dbRaw.$executeRaw`SELECT set_config('app.current_org', ${String(org)}, true)`,
    dbRaw.$queryRaw<{ id: bigint }[]>`
      SELECT id FROM contactos
      WHERE unaccent(nombre) ILIKE unaccent(${patron})
         OR telefono LIKE ${patron}
         OR unaccent(coalesce(empresa, '')) ILIKE unaccent(${patron})
      ORDER BY nombre
      LIMIT ${limite}`,
  ]);
  return filas.map((fila) => fila.id);
}
