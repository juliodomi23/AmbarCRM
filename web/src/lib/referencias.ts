import { db } from "@/lib/db";

const BUSCAR = {
  usuario: (id: bigint) => db.usuario.findFirst({ where: { id }, select: { id: true } }),
  contacto: (id: bigint) => db.contacto.findFirst({ where: { id }, select: { id: true } }),
  conversacion: (id: bigint) => db.conversacion.findFirst({ where: { id }, select: { id: true } }),
  canal: (id: bigint) => db.canalWhatsapp.findFirst({ where: { id }, select: { id: true } }),
  embudo: (id: bigint) => db.embudo.findFirst({ where: { id }, select: { id: true } }),
  etapa: (id: bigint) => db.etapa.findFirst({ where: { id }, select: { id: true } }),
  oportunidad: (id: bigint) => db.oportunidad.findFirst({ where: { id }, select: { id: true } }),
  alumno: (id: bigint) => db.alumnoAcademia.findFirst({ where: { id }, select: { id: true } }),
  curso: (id: bigint) => db.cursoAcademia.findFirst({ where: { id }, select: { id: true } }),
  inscripcion: (id: bigint) => db.inscripcionAcademia.findFirst({ where: { id }, select: { id: true } }),
  expedienteLegal: (id: bigint) => db.expedienteLegal.findFirst({ where: { id }, select: { id: true } }),
  sucursalLegal: (id: bigint) => db.sucursalLegal.findFirst({ where: { id }, select: { id: true } }),
  tour: (id: bigint) => db.tour.findFirst({ where: { id }, select: { id: true } }),
  reserva: (id: bigint) => db.reservaTour.findFirst({ where: { id }, select: { id: true } }),
};

export type TablaReferencia = keyof typeof BUSCAR;

/**
 * Las llaves foráneas de Postgres no respetan RLS: sin esta revisión se podría guardar
 * un id de otra empresa. Vacío → null (quitar la referencia); inexistente o de otra
 * empresa → false. RLS hace que la búsqueda solo vea la empresa actual.
 */
export async function referenciaPropia(
  tabla: TablaReferencia,
  valor: unknown,
): Promise<bigint | null | false> {
  if (valor == null || valor === "") return null;
  const texto = String(valor);
  if (!/^\d+$/.test(texto)) return false;
  const encontrado = await BUSCAR[tabla](BigInt(texto));
  return encontrado ? encontrado.id : false;
}

/** Revisa varios campos de un registro; devuelve el nombre del primero que no es de la empresa, o null. */
export async function referenciaAjena(
  datos: Record<string, unknown>,
  campos: Record<string, TablaReferencia>,
): Promise<string | null> {
  const resultados = await Promise.all(
    Object.entries(campos).map(async ([campo, tabla]) =>
      (await referenciaPropia(tabla, datos[campo])) === false ? campo : null,
    ),
  );
  return resultados.find(Boolean) ?? null;
}
