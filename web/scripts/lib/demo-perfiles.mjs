// Datos ficticios de actividad por giro. La mecánica vive en demo-actividad.mjs.
// Conversación: { contacto, estado, noLeidos, bot, atiende, csat, mensajes: [[entrante|saliente|nota, texto, minutosAtrás]] }
// Tarea: [titulo, vencida|hoy|proxima|sinfecha|completada, índice de oportunidad | null]

const ETIQUETAS_BASE = {
  Interesado: "#16A34A",
  "Seguimiento": "#D97706",
  "Cliente frecuente": "#2563EB",
  "Pendiente de pago": "#DC2626",
  Nuevo: "#7C3AED",
};

// Reseñas con varias calificaciones y orígenes, repartidas en las últimas semanas.
const RESENAS_VARIADAS = [
  [5, "mostrador", 1], [5, "qr-recepcion", 2], [4, "whatsapp", 3], [5, "directo", 5], [3, "mostrador", 6],
  [5, "whatsapp", 8], [4, "qr-recepcion", 9], [5, "mostrador", 12], [2, "directo", 14], [5, "whatsapp", 16],
  [4, "mostrador", 19], [5, "qr-recepcion", 22], [1, "directo", 25], [4, "whatsapp", 28], [5, "mostrador", 33],
];

const resenas = (enlace) => ({ enlaceGoogle: `https://g.page/r/${enlace}/review`, filas: RESENAS_VARIADAS });

export const PERFIL_CLINICA = {
  etiquetas: { ...ETIQUETAS_BASE, "Primera visita": "#0891B2", Ortodoncia: "#9333EA" },
  embudo: { nombre: "Pacientes", etapas: [["Nuevo contacto", "normal", "#94A3B8"], ["Valoración agendada", "normal", "#0891B2"], ["En tratamiento", "normal", "#D97706"], ["Tratamiento completado", "ganado", "#16A34A"]] },
  contactos: [
    { nombre: "Ana García", telefono: "5551000001", etiquetas: ["Primera visita", "Interesado"] },
    { nombre: "Carlos Mendoza", telefono: "5551000002", etiquetas: ["Cliente frecuente"] },
    { nombre: "Sofía Ramírez", telefono: "5551000003", etiquetas: ["Ortodoncia", "Seguimiento"] },
    { nombre: "Luis Hernández", telefono: "5551000004", etiquetas: ["Nuevo"] },
    { nombre: "Mariana López", telefono: "5551000005", etiquetas: ["Primera visita"] },
    { nombre: "Diego Castro", telefono: "5551000006", etiquetas: ["Ortodoncia", "Pendiente de pago"] },
  ],
  oportunidades: [
    [0, "Consulta · Ana García", 800, 0, 2], [1, "Limpieza · Carlos Mendoza", 1450, 1, 5],
    [2, "Ortodoncia · Sofía Ramírez", 2100, 2, 12], [3, "Consulta · Luis Hernández", 2750, "ganado", 20],
    [4, "Limpieza · Mariana López", 3400, 1, 4], [5, "Ortodoncia · Diego Castro", 4050, "perdido", 30],
  ],
  conversaciones: [
    { contacto: 0, noLeidos: 2, bot: true, atiende: null, mensajes: [["entrante", "Hola, quisiera agendar una valoración", 42], ["saliente", "Claro, tenemos espacio esta semana. ¿Prefieres mañana o tarde?", 40], ["nota", "🤖 Etiquetó: Interesado", 39], ["entrante", "Por la tarde, por favor", 6], ["entrante", "¿Tienen jueves a las 5?", 5]] },
    { contacto: 1, estado: "abierta", bot: false, atiende: 0, mensajes: [["entrante", "¿Cuánto cuesta una limpieza?", 190], ["saliente", "La valoración inicial no tiene costo", 185], ["entrante", "Quiero reservar", 120], ["saliente", "Listo, te agendé para el viernes a las 10:00", 118]] },
    { contacto: 2, estado: "pendiente", noLeidos: 1, bot: false, atiende: 0, mensajes: [["entrante", "Necesito información de ortodoncia", 1500], ["saliente", "Revisamos tu caso en consulta", 1490], ["entrante", "¿Puede ser por la tarde?", 70]] },
    { contacto: 3, estado: "cerrada", csat: 5, atiende: 0, mensajes: [["entrante", "Gracias por la atención de hoy", 2900], ["saliente", "Con gusto, ¡que te mejores!", 2895]] },
    { contacto: 4, noLeidos: 1, bot: true, atiende: null, mensajes: [["entrante", "Buenas tardes, ¿atienden los sábados?", 15]] },
  ],
  tareas: [
    ["Llamar a Ana García para confirmar valoración", "vencida", 0], ["Enviar plan de ortodoncia a Sofía", "hoy", 2],
    ["Recordatorio de limpieza a Carlos", "proxima", 1], ["Dar seguimiento a Mariana López", "proxima", 4],
    ["Actualizar lista de precios de tratamientos", "sinfecha", null], ["Cobrar saldo pendiente de Diego", "hoy", 5],
    ["Enviar encuesta a Luis Hernández", "completada", 3],
  ],
  resenas: resenas("demo-clinica-horizonte"),
};

export const PERFIL_AUTOMOTRIZ = {
  etiquetas: { ...ETIQUETAS_BASE, "Prueba de manejo": "#0891B2", Financiamiento: "#9333EA" },
  embudo: { nombre: "Ventas de autos", etapas: [["Prospecto", "normal", "#94A3B8"], ["Prueba de manejo", "normal", "#0891B2"], ["Negociación", "normal", "#D97706"], ["Vendido", "ganado", "#16A34A"]] },
  contactos: [
    { nombre: "Laura Méndez", telefono: "5552000001", etiquetas: ["Prueba de manejo", "Interesado"] },
    { nombre: "Miguel Santos", telefono: "5552000002", etiquetas: ["Financiamiento"] },
    { nombre: "Fernanda Ríos", telefono: "5552000003", etiquetas: ["Seguimiento"] },
    { nombre: "Rodrigo Páez", telefono: "5552000004", etiquetas: ["Nuevo"] },
    { nombre: "Alicia Torres", telefono: "5552000005", etiquetas: ["Cliente frecuente"] },
  ],
  oportunidades: [
    [0, "Toyota Corolla · Laura Méndez", 389000, 1, 3], [1, "Mazda CX-30 · Miguel Santos", 419900, 2, 6],
    [2, "Nissan Kicks · Fernanda Ríos", 438000, 0, 1], [3, "Kia Seltos · Rodrigo Páez", 449000, 0, 2],
    [4, "Honda Civic · Alicia Torres", 399000, "ganado", 15], [2, "Jetta Comfortline · Fernanda Ríos", 369000, "perdido", 24],
  ],
  conversaciones: [
    { contacto: 0, noLeidos: 1, bot: true, atiende: null, mensajes: [["entrante", "Hola, ¿sigue disponible el Corolla blanco?", 30], ["saliente", "Sí, está disponible. ¿Quieres agendar una prueba de manejo?", 28], ["nota", "🤖 Agendó cita: mañana 10:00 con Vendedor", 27], ["entrante", "Perfecto, ahí nos vemos", 8]] },
    { contacto: 1, atiende: 0, bot: false, mensajes: [["entrante", "¿Cuál sería la mensualidad con 20% de enganche?", 200], ["saliente", "Te preparo la simulación y te la envío hoy", 190]] },
    { contacto: 2, estado: "pendiente", noLeidos: 2, bot: true, atiende: null, mensajes: [["entrante", "¿Aceptan mi auto a cuenta?", 95], ["entrante", "Es un Versa 2019", 94]] },
    { contacto: 4, estado: "cerrada", csat: 5, atiende: 0, mensajes: [["saliente", "¡Felicidades por tu Civic! Ya está lista la entrega", 4300], ["entrante", "Gracias, excelente servicio", 4280]] },
  ],
  tareas: [
    ["Enviar simulación de financiamiento a Miguel", "vencida", 1], ["Preparar prueba de manejo de Laura", "hoy", 0],
    ["Llamar a Fernanda por su auto a cuenta", "proxima", 2], ["Dar seguimiento a Rodrigo Páez", "proxima", 3],
    ["Fotografiar unidades nuevas del inventario", "sinfecha", null], ["Entregar papeles del Civic", "completada", 4],
  ],
  resenas: resenas("demo-autos-horizonte"),
};

export const PERFIL_INMOBILIARIA = {
  etiquetas: { ...ETIQUETAS_BASE, Compra: "#0891B2", Renta: "#9333EA" },
  embudo: { nombre: "Operaciones", etapas: [["Consulta", "normal", "#94A3B8"], ["Visita programada", "normal", "#0891B2"], ["Oferta", "normal", "#D97706"], ["Cierre", "ganado", "#16A34A"]] },
  contactos: [
    { nombre: "Andrea Gil", telefono: "5553000001", etiquetas: ["Compra", "Interesado"] },
    { nombre: "José Flores", telefono: "5553000002", etiquetas: ["Renta"] },
    { nombre: "Paola Cruz", telefono: "5553000003", etiquetas: ["Compra", "Seguimiento"] },
    { nombre: "Héctor Vidal", telefono: "5553000004", etiquetas: ["Nuevo"] },
    { nombre: "Irene Salas", telefono: "5553000005", etiquetas: ["Renta", "Pendiente de pago"] },
  ],
  oportunidades: [
    [0, "Casa en Jardines · Andrea Gil", 3850000, 1, 4], [1, "Departamento centro · José Flores", 12500, 0, 2],
    [2, "Terreno campestre · Paola Cruz", 1450000, 2, 9], [3, "Local comercial · Héctor Vidal", 22000, 0, 1],
    [4, "Departamento norte · Irene Salas", 9800, "ganado", 18], [3, "Casa en preventa · Héctor Vidal", 2900000, "perdido", 26],
  ],
  conversaciones: [
    { contacto: 0, noLeidos: 1, bot: true, atiende: null, mensajes: [["entrante", "Vi la casa de Jardines en su página, ¿puedo visitarla?", 55], ["saliente", "Claro, tengo disponible el jueves a las 11:00", 50], ["nota", "🤖 Movió a etapa: Visita programada", 49], ["entrante", "Jueves me va perfecto", 12]] },
    { contacto: 1, atiende: 0, bot: false, mensajes: [["entrante", "¿El departamento incluye estacionamiento?", 300], ["saliente", "Sí, un cajón techado. Te mando fotos", 295]] },
    { contacto: 2, estado: "pendiente", atiende: 0, bot: false, noLeidos: 1, mensajes: [["saliente", "Te comparto el avalúo del terreno", 800], ["entrante", "Lo reviso con mi esposo y te aviso", 60]] },
    { contacto: 4, estado: "cerrada", csat: 4, atiende: 0, mensajes: [["entrante", "Ya firmé el contrato, gracias", 5000], ["saliente", "¡Bienvenida a tu nuevo hogar!", 4990]] },
  ],
  tareas: [
    ["Enviar fotos del departamento a José", "vencida", 1], ["Confirmar visita de Andrea Gil", "hoy", 0],
    ["Llamar a Paola por la oferta del terreno", "proxima", 2], ["Preparar contrato de renta", "proxima", 4],
    ["Actualizar fichas de propiedades", "sinfecha", null], ["Cobrar depósito de Irene Salas", "completada", 4],
  ],
  resenas: resenas("demo-inmobiliaria"),
};

export const PERFIL_RETAIL = {
  etiquetas: { ...ETIQUETAS_BASE, Mayoreo: "#0891B2", "Fiado": "#9333EA" },
  embudo: { nombre: "Pedidos y cotizaciones", etapas: [["Consulta", "normal", "#94A3B8"], ["Cotización enviada", "normal", "#0891B2"], ["Por cobrar", "normal", "#D97706"], ["Vendido", "ganado", "#16A34A"]] },
  contactos: [
    { nombre: "Ana Salgado", telefono: "5554000001", etiquetas: ["Cliente frecuente", "Interesado"] },
    { nombre: "Mariana León", telefono: "5554000002", etiquetas: ["Seguimiento"] },
    { nombre: "Carolina Treviño", telefono: "5554000003", etiquetas: ["Mayoreo"] },
    { nombre: "Sofía Lozano", telefono: "5554000004", etiquetas: ["Nuevo"] },
    { nombre: "Jorge Medina", telefono: "5554000005", etiquetas: ["Fiado", "Pendiente de pago"] },
    { nombre: "Luisa Ramos", telefono: "5554000006", etiquetas: ["Cliente frecuente"] },
  ],
  oportunidades: [
    [0, "Camisa lino arena · Ana Salgado", 899, 1, 3], [2, "Pedido mayoreo velas · Carolina Treviño", 5040, 2, 5],
    [3, "Bolsa piel terracota · Sofía Lozano", 1890, 0, 1], [4, "Pantalón y pañuelo · Jorge Medina", 1870, 2, 4],
    [5, "Tenis urbanos · Luisa Ramos", 1490, "ganado", 10], [1, "Set de tazas · Mariana León", 1440, "perdido", 20],
  ],
  conversaciones: [
    { contacto: 0, noLeidos: 1, bot: true, atiende: null, mensajes: [["entrante", "Hola, ¿tienen la camisa de lino en talla M?", 25], ["saliente", "Sí, nos quedan 3 piezas. ¿Te la apartamos?", 22], ["nota", "🤖 Creó cotización DEMO-COT-001", 21], ["entrante", "Sí, por favor", 9]] },
    { contacto: 2, atiende: 1, bot: false, mensajes: [["entrante", "Necesito 12 velas para un evento, ¿hay precio de mayoreo?", 240], ["saliente", "Claro, te mando la cotización en un momento", 230]] },
    { contacto: 3, noLeidos: 2, bot: true, atiende: null, mensajes: [["entrante", "¿Hacen envíos a Chiapa de Corzo?", 40], ["entrante", "¿Cuánto tarda?", 39]] },
    { contacto: 4, estado: "pendiente", atiende: 0, bot: false, mensajes: [["saliente", "Jorge, te recordamos tu saldo pendiente de $1,870", 1400], ["entrante", "Paso el sábado a liquidarlo", 1300]] },
    { contacto: 5, estado: "cerrada", csat: 5, atiende: 0, mensajes: [["entrante", "Gracias, los tenis quedaron perfectos", 6000]] },
  ],
  tareas: [
    ["Cobrar saldo pendiente a Jorge Medina", "vencida", 3], ["Enviar cotización de mayoreo a Carolina", "hoy", 1],
    ["Confirmar apartado de camisa a Ana", "proxima", 0], ["Reponer inventario de libretas", "proxima", null],
    ["Revisar catálogo en línea", "sinfecha", null], ["Entregar pedido de tenis a Luisa", "completada", 4],
  ],
  resenas: resenas("demo-casa-ambar"),
};

export const PERFIL_LEGAL = {
  etiquetas: { ...ETIQUETAS_BASE, Familiar: "#0891B2", Mercantil: "#9333EA" },
  embudo: { nombre: "Asuntos", etapas: [["Consulta", "normal", "#94A3B8"], ["Propuesta de honorarios", "normal", "#0891B2"], ["En trámite", "normal", "#D97706"], ["Asunto concluido", "ganado", "#16A34A"]] },
  contactos: [
    { nombre: "Mariana Ejemplo", telefono: "5558100001", etiquetas: ["Familiar", "Seguimiento"] },
    { nombre: "Carlos Demostración", telefono: "5558100002", etiquetas: ["Mercantil"] },
    { nombre: "Sofía Muestra", telefono: "5558100003", etiquetas: ["Familiar", "Pendiente de pago"] },
    { nombre: "Ramiro Ficticio", telefono: "5558100004", etiquetas: ["Nuevo", "Interesado"] },
  ],
  oportunidades: [
    [0, "Convenio de divorcio · Mariana Ejemplo", 18000, 2, 10], [1, "Contrato de arrendamiento · Carlos Demostración", 6500, 1, 4],
    [2, "Pensión alimenticia · Sofía Muestra", 12000, 2, 14], [3, "Constitución de sociedad · Ramiro Ficticio", 9500, 0, 1],
    [1, "Cobranza mercantil · Carlos Demostración", 15000, "ganado", 25], [3, "Asesoría laboral · Ramiro Ficticio", 4000, "perdido", 30],
  ],
  conversaciones: [
    { contacto: 0, noLeidos: 1, bot: true, atiende: null, mensajes: [["entrante", "Buenas tardes, necesito saber cómo va mi asunto", 35], ["nota", "🤖 Etiquetó: Seguimiento", 34], ["saliente", "Con gusto, la licenciada le llamará hoy", 20]] },
    { contacto: 1, atiende: 0, bot: false, mensajes: [["entrante", "Le envío el borrador del contrato", 400], ["saliente", "Recibido, lo reviso y le comento mañana", 380]] },
    { contacto: 3, noLeidos: 2, bot: true, atiende: null, mensajes: [["entrante", "Quiero constituir una empresa, ¿qué documentos necesito?", 18], ["entrante", "¿Cuánto cuesta?", 17]] },
    { contacto: 2, estado: "pendiente", atiende: 0, bot: false, mensajes: [["saliente", "Le recordamos su cita de firma del jueves", 900]] },
  ],
  tareas: [
    ["Revisar contrato de arrendamiento", "vencida", 1], ["Llamar a Mariana Ejemplo", "hoy", 0],
    ["Presentar promoción en juzgado", "proxima", 2], ["Enviar propuesta de honorarios a Ramiro", "proxima", 3],
    ["Ordenar archivo de expedientes", "sinfecha", null], ["Cobrar honorarios de cobranza", "completada", 4],
  ],
  resenas: resenas("demo-legal-ambar"),
};

export const PERFIL_VIAJES = {
  etiquetas: { ...ETIQUETAS_BASE, "Grupo familiar": "#0891B2", "Luna de miel": "#9333EA" },
  embudo: { nombre: "Reservas", etapas: [["Consulta", "normal", "#94A3B8"], ["Cotización enviada", "normal", "#0891B2"], ["Apartado", "normal", "#D97706"], ["Pagado", "ganado", "#16A34A"]] },
  contactos: [
    { nombre: "Ana Viajera", telefono: "5558200001", etiquetas: ["Grupo familiar", "Interesado"] },
    { nombre: "Luis Turista", telefono: "5558200002", etiquetas: ["Cliente frecuente"] },
    { nombre: "Mónica Paseo", telefono: "5558200003", etiquetas: ["Luna de miel", "Pendiente de pago"] },
    { nombre: "Gerardo Ruta", telefono: "5558200004", etiquetas: ["Nuevo"] },
  ],
  oportunidades: [
    [0, "Oaxaca cultural · Ana Viajera (4 personas)", 31200, 1, 3], [1, "Guanajuato fin de semana · Luis Turista", 5400, 2, 6],
    [2, "Playa del Carmen · Mónica Paseo", 22800, 2, 9], [3, "Chiapas ecológico · Gerardo Ruta", 8900, 0, 1],
    [1, "Tour Pueblos Mágicos · Luis Turista", 6300, "ganado", 20], [3, "Cañón del Sumidero · Gerardo Ruta", 2400, "perdido", 22],
  ],
  conversaciones: [
    { contacto: 0, noLeidos: 1, bot: true, atiende: null, mensajes: [["entrante", "Somos 4, ¿hay lugar para el tour a Oaxaca en noviembre?", 33], ["saliente", "Sí, quedan 6 lugares. ¿Te aparto 4?", 30], ["nota", "🤖 Etiquetó: Grupo familiar", 29], ["entrante", "Sí, apártalos por favor", 7]] },
    { contacto: 2, atiende: 0, bot: false, mensajes: [["entrante", "¿Puedo pagar en dos partes?", 600], ["saliente", "Claro, el 50% hoy y el resto antes de la salida", 590]] },
    { contacto: 3, noLeidos: 1, bot: true, atiende: null, mensajes: [["entrante", "¿El tour a Chiapas incluye hospedaje?", 12]] },
    { contacto: 1, estado: "cerrada", csat: 5, atiende: 0, mensajes: [["entrante", "¡Qué buen viaje! Ya quiero el siguiente", 3500], ["saliente", "Nos da mucho gusto, te avisamos de las próximas salidas", 3490]] },
  ],
  tareas: [
    ["Enviar itinerario a Ana Viajera", "vencida", 0], ["Cobrar segundo pago de Mónica", "hoy", 2],
    ["Confirmar hotel de Guanajuato", "proxima", 1], ["Cotizar Chiapas para Gerardo", "proxima", 3],
    ["Actualizar fotos del catálogo de tours", "sinfecha", null], ["Enviar recibo a Luis Turista", "completada", 4],
  ],
  resenas: resenas("demo-viajes-ambar"),
};

export const PERFIL_ACADEMIA = {
  etiquetas: { ...ETIQUETAS_BASE, Inscrito: "#0891B2", "Beca": "#9333EA" },
  embudo: { nombre: "Admisiones", etapas: [["Informes", "normal", "#94A3B8"], ["Clase muestra", "normal", "#0891B2"], ["Por inscribir", "normal", "#D97706"], ["Inscrito", "ganado", "#16A34A"]] },
  contactos: [
    { nombre: "Camila Torres", telefono: "5558300001", etiquetas: ["Inscrito"] },
    { nombre: "Diego Luna", telefono: "5558300002", etiquetas: ["Inscrito", "Pendiente de pago"] },
    { nombre: "Renata Solís", telefono: "5558300003", etiquetas: ["Beca", "Seguimiento"] },
    { nombre: "Mateo Ríos", telefono: "5558300004", etiquetas: ["Inscrito"] },
    { nombre: "Valentina Arce", telefono: "5558300005", etiquetas: ["Nuevo", "Interesado"] },
  ],
  oportunidades: [
    [4, "Inglés inicial · Valentina Arce", 1450, 0, 1], [2, "Matemáticas · Renata Solís", 1200, 2, 5],
    [1, "Inglés inicial · Diego Luna", 1450, 1, 3], [0, "Inglés inicial · Camila Torres", 1450, "ganado", 15],
    [3, "Matemáticas · Mateo Ríos", 1200, "ganado", 12], [2, "Taller de verano · Renata Solís", 900, "perdido", 40],
  ],
  conversaciones: [
    { contacto: 4, noLeidos: 1, bot: true, atiende: null, mensajes: [["entrante", "Buenas, ¿cuándo inicia el curso de inglés para niños?", 28], ["saliente", "El grupo nuevo arranca el lunes. ¿Te cuento los horarios?", 25], ["nota", "🤖 Movió a etapa: Informes", 24], ["entrante", "Sí, por favor", 10]] },
    { contacto: 1, estado: "pendiente", atiende: 0, bot: false, mensajes: [["saliente", "Recordatorio: la colegiatura de octubre vence hoy", 500], ["entrante", "Hago la transferencia hoy mismo", 420]] },
    { contacto: 2, atiende: 0, bot: false, noLeidos: 1, mensajes: [["entrante", "¿La beca cubre también los materiales?", 80]] },
    { contacto: 0, estado: "cerrada", csat: 5, atiende: 0, mensajes: [["entrante", "Gracias, mi hija está feliz en las clases", 7000]] },
  ],
  tareas: [
    ["Cobrar colegiatura de Diego Luna", "vencida", 2], ["Responder a Renata sobre la beca", "hoy", 1],
    ["Agendar clase muestra de Valentina", "proxima", 0], ["Preparar lista de asistencia de noviembre", "proxima", null],
    ["Actualizar horarios en el sitio", "sinfecha", null], ["Entregar constancia a Camila Torres", "completada", 3],
  ],
  resenas: resenas("demo-academia-faro"),
};
