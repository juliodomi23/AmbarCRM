// Configuración por giro de la demo: marca, usuarios y módulos que se encienden.
// Referencia: web/scripts/seed-demo-*.mjs (las empresas demo que se siembran en el CRM real).
import type { BrandPreset } from "@/lib/brand";
import type { GiroId } from "./tipos";

export type GiroConfig = {
  id: GiroId;
  /** Nombre corto en el selector de la barra demo. */
  etiqueta: string;
  marca: string;
  preset: BrandPreset;
  usuarios: Array<{ nombre: string; puesto: string; rol?: "admin" | "agente" }>;
  /** Módulos de `MODULOS` (lib/modulos-catalogo) que quedan activos con su configuración. */
  modulos: Record<string, Record<string, unknown>>;
};

export const GIROS: GiroConfig[] = [
  {
    id: "clinica",
    etiqueta: "Clínica",
    marca: "Clínica Horizonte",
    preset: "salud",
    usuarios: [
      { nombre: "Dra. Elena Torres", puesto: "Doctor", rol: "admin" },
      { nombre: "Recepción Horizonte", puesto: "Recepcionista" },
      { nombre: "Dr. Mateo Salas", puesto: "Doctor" },
    ],
    modulos: { citas: { anticipacionHoras: 24 }, pacientes: {}, reservas_en_linea: {}, resenas: {} },
  },
  {
    id: "retail",
    etiqueta: "Retail",
    marca: "Casa Ámbar Boutique",
    preset: "retail",
    usuarios: [
      { nombre: "Gerencia Casa Ámbar", puesto: "Administrador", rol: "admin" },
      { nombre: "Daniela Soto", puesto: "Vendedor de tienda" },
      { nombre: "Mateo Ruiz", puesto: "Cajero" },
      { nombre: "Elena Paz", puesto: "Encargado de inventario" },
      { nombre: "Paula Vega", puesto: "Encargado de tienda" },
    ],
    modulos: { productos: {}, compras: {}, ventas: {}, caja: {}, cotizaciones: {}, pedidos_en_linea: {}, resenas: {} },
  },
  {
    id: "legal",
    etiqueta: "Legal",
    marca: "Demo Legal Ámbar",
    preset: "legal",
    usuarios: [
      { nombre: "Lic. Andrea Campos", puesto: "Abogado", rol: "admin" },
      { nombre: "Lic. Rubén Ortiz", puesto: "Abogado" },
    ],
    modulos: { legal: {}, asesorias_legales: {}, finanzas_legales: {}, operacion_legal: {}, citas: {} },
  },
  {
    id: "automotriz",
    etiqueta: "Automotriz",
    marca: "Autos Horizonte",
    preset: "ambar-rojo",
    usuarios: [
      { nombre: "Gerencia Autos Horizonte", puesto: "Administrador", rol: "admin" },
      { nombre: "Mariana Vega", puesto: "Asesor automotriz" },
      { nombre: "Diego Luna", puesto: "Asesor automotriz" },
    ],
    modulos: { automotriz: {}, citas: {} },
  },
  {
    id: "inmobiliaria",
    etiqueta: "Inmobiliaria",
    marca: "Inmobiliaria Horizonte",
    preset: "inmobiliaria",
    usuarios: [
      { nombre: "Gerencia Inmobiliaria Horizonte", puesto: "Administrador", rol: "admin" },
      { nombre: "Sofía Campos", puesto: "Asesor inmobiliario" },
      { nombre: "Raúl Benítez", puesto: "Asesor inmobiliario" },
    ],
    modulos: { inmobiliaria: {}, citas: {} },
  },
  {
    id: "viajes",
    etiqueta: "Viajes",
    marca: "Horizonte Tours",
    preset: "belleza",
    usuarios: [
      { nombre: "Paola Rivera", puesto: "Agente de viajes", rol: "admin" },
      { nombre: "Luis Ortega", puesto: "Agente de viajes" },
    ],
    modulos: { tours: {}, reservas_tours: {}, pagos_tours: {} },
  },
  {
    id: "educacion",
    etiqueta: "Educación",
    marca: "Academia Faro",
    preset: "ambar-rojo",
    usuarios: [
      { nombre: "Laura Méndez", puesto: "Coordinador académico", rol: "admin" },
      { nombre: "Prof. Hugo Sánchez", puesto: "Coordinador académico" },
    ],
    modulos: { alumnos: {}, cursos_academia: {}, inscripciones_academia: {}, colegiaturas: {}, asistencia_academia: {} },
  },
];

export const GIRO_INICIAL: GiroId = "clinica";
export const giroPorId = (id: string) => GIROS.find((g) => g.id === id) ?? GIROS[0];
