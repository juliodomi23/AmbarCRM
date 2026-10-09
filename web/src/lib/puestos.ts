const PUESTOS_BASE = ["Administrador", "Agente"] as const;

const PUESTOS_POR_MODULO: Record<string, readonly string[]> = {
  pacientes: ["Recepcionista", "Doctor", "Coordinador clínico", "Especialista"],
  citas: ["Recepcionista"],
  automotriz: ["Asesor automotriz", "Vendedor"],
  inmobiliaria: ["Asesor inmobiliario", "Vendedor"],
  productos: ["Vendedor de tienda", "Cajero", "Encargado de inventario"],
  compras: ["Encargado de inventario"],
  ventas: ["Vendedor de tienda", "Cajero"],
  caja: ["Cajero", "Encargado de tienda"],
  legal: ["Abogado", "Pasante", "Asistente jurídico", "Coordinador jurídico"],
  asesorias_legales: ["Abogado", "Pasante", "Asistente jurídico", "Coordinador jurídico"],
  finanzas_legales: ["Abogado", "Coordinador jurídico"],
  operacion_legal: ["Abogado", "Pasante", "Asistente jurídico", "Coordinador jurídico"],
  tours: ["Agente de viajes", "Coordinador de tours", "Guía"],
  reservas_tours: ["Agente de viajes", "Coordinador de tours"],
  pagos_tours: ["Agente de viajes", "Coordinador de tours"],
  alumnos: ["Profesor", "Coordinador académico", "Recepcionista"],
  cursos_academia: ["Profesor", "Coordinador académico"],
  inscripciones_academia: ["Profesor", "Coordinador académico", "Recepcionista"],
  colegiaturas: ["Coordinador académico", "Cajero"],
  asistencia_academia: ["Profesor", "Coordinador académico"],
};

export const PUESTOS_CATALOGO = [
  ...PUESTOS_BASE,
  ...new Set(Object.values(PUESTOS_POR_MODULO).flat()),
] as string[];

export function puestosParaModulos(claves: string[]) {
  return [
    ...PUESTOS_BASE,
    ...new Set(claves.flatMap((clave) => PUESTOS_POR_MODULO[clave] ?? [])),
  ];
}

export function validarPuesto(valor: unknown) {
  if (typeof valor !== "string") return { error: "el puesto debe ser texto" } as const;
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(valor)) {
    return { error: "el puesto contiene caracteres de control" } as const;
  }
  const limpio = valor.trim().replace(/\s+/gu, " ");
  if (!limpio) return { error: "el puesto es obligatorio" } as const;
  if (limpio.length > 60) return { error: "el puesto no puede exceder 60 caracteres" } as const;
  const comparable = limpio.toLocaleLowerCase("es-MX");
  const canonico = PUESTOS_CATALOGO.find(
    (puesto) => puesto.toLocaleLowerCase("es-MX") === comparable,
  );
  return { valor: canonico ?? limpio } as const;
}
