export type DemoVista =
  | "inicio"
  | "chat"
  | "embudo"
  | "contactos"
  | "tareas"
  | "difusion"
  | "automatizaciones"
  | "modulos"
  | "configuracion";

export type DemoVertical =
  | "clinica"
  | "automotriz"
  | "inmobiliaria"
  | "retail"
  | "legal"
  | "viajes"
  | "educacion";

export const NAVEGACION_DEMO: Array<{
  vista: DemoVista;
  etiqueta: string;
  grupo: string;
  icono: string;
}> = [
  { vista: "inicio", etiqueta: "Inicio", grupo: "", icono: "inicio" },
  { vista: "chat", etiqueta: "Chat", grupo: "Conversaciones", icono: "chat" },
  { vista: "embudo", etiqueta: "Embudos", grupo: "Ventas", icono: "embudo" },
  { vista: "contactos", etiqueta: "Contactos", grupo: "Ventas", icono: "contactos" },
  { vista: "tareas", etiqueta: "Tareas", grupo: "Ventas", icono: "tareas" },
  { vista: "difusion", etiqueta: "Difusión", grupo: "Gestión", icono: "difusion" },
  { vista: "automatizaciones", etiqueta: "Automatizaciones", grupo: "Gestión", icono: "automatizaciones" },
  { vista: "modulos", etiqueta: "Módulos por giro", grupo: "Gestión", icono: "modulos" },
  { vista: "configuracion", etiqueta: "Configuración", grupo: "Gestión", icono: "configuracion" },
];

export const VERTICALES: Array<{
  id: DemoVertical;
  nombre: string;
  descripcion: string;
  frase: string;
  metricas: Array<{ etiqueta: string; valor: string }>;
  modulos: Array<{
    nombre: string;
    descripcion: string;
    estado?: string;
  }>;
}> = [
  {
    id: "clinica",
    nombre: "Clínica",
    descripcion: "Agenda, pacientes y acceso clínico por puesto.",
    frase: "Recepción agenda; el doctor ve el expediente; cada quien lo suyo.",
    metricas: [
      { etiqueta: "Citas de hoy", valor: "18" },
      { etiqueta: "En sala", valor: "3" },
      { etiqueta: "Confirmadas", valor: "14" },
    ],
    modulos: [
      { nombre: "Pacientes", descripcion: "Expediente, alergias, antecedentes y evoluciones." },
      { nombre: "Citas", descripcion: "Agenda diaria y semanal, estados y recordatorios." },
      { nombre: "Reservas en línea", descripcion: "Liga pública con disponibilidad real." },
      { nombre: "Lealtad", descripcion: "Sellos, premios y avisos con Aurum." },
    ],
  },
  {
    id: "automotriz",
    nombre: "Automotriz",
    descripcion: "Inventario de unidades y seguimiento comercial.",
    frase: "Cada prospecto tiene dueño y siguiente paso.",
    metricas: [
      { etiqueta: "Disponibles", valor: "27" },
      { etiqueta: "Reservados", valor: "5" },
      { etiqueta: "Pruebas hoy", valor: "4" },
    ],
    modulos: [
      { nombre: "Automotriz", descripcion: "Marca, modelo, VIN, kilometraje, precio, foto y estado." },
      { nombre: "Citas", descripcion: "Pruebas de manejo ligadas al prospecto y asesor." },
    ],
  },
  {
    id: "inmobiliaria",
    nombre: "Inmobiliaria",
    descripcion: "Propiedades, prospectos y visitas por asesor.",
    frase: "Los clientes dejan de vivir en celulares personales.",
    metricas: [
      { etiqueta: "Propiedades", valor: "64" },
      { etiqueta: "Visitas", valor: "9" },
      { etiqueta: "En negociación", valor: "7" },
    ],
    modulos: [
      { nombre: "Inmobiliaria", descripcion: "Venta o renta, ubicación, superficie, precio y disponibilidad." },
      { nombre: "Citas", descripcion: "Visitas a propiedades con responsable y recordatorio." },
    ],
  },
  {
    id: "retail",
    nombre: "Retail",
    descripcion: "Pedidos, compras e inventario sincronizado.",
    frase: "Vender sin vender lo que no tienes.",
    metricas: [
      { etiqueta: "Ventas hoy", valor: "$18,420" },
      { etiqueta: "Stock bajo", valor: "6" },
      { etiqueta: "Pedidos", valor: "23" },
    ],
    modulos: [
      { nombre: "Productos e inventario", descripcion: "SKU, precios, existencias y movimientos auditados." },
      { nombre: "Compras y proveedores", descripcion: "Órdenes y recepción que actualiza existencias." },
      { nombre: "Ventas y pedidos", descripcion: "Mostrador, WhatsApp, teléfono y tienda en línea." },
    ],
  },
  {
    id: "legal",
    nombre: "Legal",
    descripcion: "Expedientes sensibles, honorarios y operación.",
    frase: "La información sensible no está al alcance de todos.",
    metricas: [
      { etiqueta: "Expedientes", valor: "42" },
      { etiqueta: "Términos próximos", valor: "5" },
      { etiqueta: "Por cobrar", valor: "$86,500" },
    ],
    modulos: [
      { nombre: "Expedientes legales", descripcion: "Asuntos, actuaciones, audiencias, documentos y términos." },
      { nombre: "Asesorías legales", descripcion: "Consultas, seguimiento y conversión a contrato." },
      { nombre: "Honorarios y caja", descripcion: "Planes de pago, cobros, gastos y diligencias." },
      { nombre: "Operación del despacho", descripcion: "Sucursales, asistencia y productividad." },
    ],
  },
  {
    id: "viajes",
    nombre: "Viajes y tours",
    descripcion: "Salidas, cupos, viajeros y saldos.",
    frase: "El cupo no se sobrepasa aunque reserven al mismo tiempo.",
    metricas: [
      { etiqueta: "Próximas salidas", valor: "8" },
      { etiqueta: "Viajeros", valor: "126" },
      { etiqueta: "Saldo pendiente", valor: "$54,300" },
    ],
    modulos: [
      { nombre: "Tours y salidas", descripcion: "Destino, itinerario, fechas, precio y capacidad." },
      { nombre: "Reservas y viajeros", descripcion: "Apartados, pasajeros, confirmación y saldo." },
      { nombre: "Cobranza de viajes", descripcion: "Anticipos y liquidaciones validados contra saldo." },
    ],
  },
  {
    id: "educacion",
    nombre: "Educación",
    descripcion: "Alumnos, cursos, pagos y asistencia.",
    frase: "Saber quién pagó y quién no, sin cuadernos.",
    metricas: [
      { etiqueta: "Alumnos activos", valor: "184" },
      { etiqueta: "Grupos", valor: "12" },
      { etiqueta: "Cartera", valor: "$31,200" },
    ],
    modulos: [
      { nombre: "Alumnos", descripcion: "Matrícula, tutor, nivel e historial." },
      { nombre: "Cursos y grupos", descripcion: "Profesor, horario, cupo y mensualidad." },
      { nombre: "Inscripciones", descripcion: "Altas, bajas y avance por curso." },
      { nombre: "Colegiaturas", descripcion: "Cargos, vencimientos, pagos y cartera." },
      { nombre: "Asistencia", descripcion: "Presentes, faltas, retardos y justificaciones." },
    ],
  },
];

export const CONVERSACIONES = [
  { id: 1, nombre: "Mariana López", mensaje: "¿Tienen lugar mañana por la tarde?", hora: "10:42", noLeidos: 2, etiqueta: "Cita" },
  { id: 2, nombre: "Carlos Hernández", mensaje: "Ya revisé la cotización, me interesa.", hora: "10:18", noLeidos: 1, etiqueta: "Caliente" },
  { id: 3, nombre: "Sofía Ramírez", mensaje: "Gracias, quedo pendiente.", hora: "09:55", noLeidos: 0, etiqueta: "Seguimiento" },
  { id: 4, nombre: "Diego Morales", mensaje: "Te envío el comprobante.", hora: "Ayer", noLeidos: 0, etiqueta: "Pago" },
];

export const OPORTUNIDADES_INICIALES = [
  { id: 1, nombre: "Mariana López", empresa: "Clínica del Centro", valor: 18500, etapa: "Nuevo", dias: 0 },
  { id: 2, nombre: "Carlos Hernández", empresa: "Grupo Horizonte", valor: 32000, etapa: "Calificado", dias: 2 },
  { id: 3, nombre: "Sofía Ramírez", empresa: "Academia Prisma", valor: 24700, etapa: "Propuesta", dias: 4 },
  { id: 4, nombre: "Diego Morales", empresa: "Ruta Maya Tours", valor: 41600, etapa: "Negociación", dias: 1 },
  { id: 5, nombre: "Elena Cruz", empresa: "Casa Nativa", valor: 29800, etapa: "Nuevo", dias: 3 },
];

export const CONTACTOS = [
  { nombre: "Mariana López", telefono: "+52 961 142 8890", empresa: "Clínica del Centro", responsable: "Ana", etiqueta: "Cita", ultima: "Hoy, 10:42" },
  { nombre: "Carlos Hernández", telefono: "+52 961 318 2044", empresa: "Grupo Horizonte", responsable: "Luis", etiqueta: "Caliente", ultima: "Hoy, 10:18" },
  { nombre: "Sofía Ramírez", telefono: "+52 961 507 3112", empresa: "Academia Prisma", responsable: "Ana", etiqueta: "Seguimiento", ultima: "Hoy, 09:55" },
  { nombre: "Diego Morales", telefono: "+52 961 211 0938", empresa: "Ruta Maya Tours", responsable: "Julio", etiqueta: "Pago", ultima: "Ayer" },
  { nombre: "Elena Cruz", telefono: "+52 961 904 7721", empresa: "Casa Nativa", responsable: "Luis", etiqueta: "Nuevo", ultima: "Lun, 16:20" },
];

export const TAREAS_INICIALES = [
  { id: 1, titulo: "Enviar propuesta a Grupo Horizonte", fecha: "Hoy · 12:00", responsable: "Luis", lista: false },
  { id: 2, titulo: "Confirmar cita de Mariana", fecha: "Hoy · 14:30", responsable: "Ana", lista: false },
  { id: 3, titulo: "Revisar comprobante de Ruta Maya", fecha: "Hoy · 17:00", responsable: "Julio", lista: false },
  { id: 4, titulo: "Seguimiento a Academia Prisma", fecha: "Mañana · 09:00", responsable: "Ana", lista: false },
];

export const PASOS_RECORRIDO: Array<{
  vista: DemoVista;
  titulo: string;
  descripcion: string;
}> = [
  { vista: "inicio", titulo: "Pulso del negocio", descripcion: "Métricas operativas, ventas, respuesta, satisfacción y actividad en un vistazo." },
  { vista: "chat", titulo: "Bandeja compartida", descripcion: "Asignación, notas, etiquetas, ventana de 24 horas, plantillas y sugerencias con IA." },
  { vista: "embudo", titulo: "Seguimiento comercial", descripcion: "Cada conversación puede convertirse en una oportunidad con responsable, valor y siguiente paso." },
  { vista: "contactos", titulo: "Una sola ficha", descripcion: "Teléfono, conversaciones, oportunidades, etiquetas y campos propios sin duplicar al cliente." },
  { vista: "modulos", titulo: "Un CRM para cada giro", descripcion: "Explora los 22 módulos ya construidos para clínica, retail, legal, viajes, educación y más." },
  { vista: "configuracion", titulo: "Control y seguridad", descripcion: "Marca, usuarios, puestos, automatizaciones, bots, plantillas y aislamiento por empresa." },
];
