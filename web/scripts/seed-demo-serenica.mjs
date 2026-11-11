// Lleva a la org real `demo-clinica` (con login) los datos de la demo interactiva de Serénica
// (src/lib/demo/semilla-extra.ts): pacientes, odontogramas, agenda de Ricardo y Paloma, servicios y horarios.
// Uso: ALLOW_DEMO_SEED=1 node scripts/seed-demo-serenica.mjs clinica@ambar.demo "<contraseña>"
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { credencialesDemo, imprimirCredencialesDemo } from "./lib/demo-seed.mjs";

const { email, password, passwordGenerada } = credencialesDemo("clinica@ambar.demo");
const prisma = new PrismaClient();
const ZONA = "America/Mexico_City";

function fechaEstaSemana(diaDesdeLunes, hora) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  const base = new Date(Date.UTC(Number(partes.year), Number(partes.month) - 1, Number(partes.day)));
  base.setUTCDate(base.getUTCDate() - ((base.getUTCDay() + 6) % 7) + diaDesdeLunes);
  return new Date(`${base.toISOString().slice(0, 10)}T${String(hora).padStart(2, "0")}:00:00-06:00`);
}

const AGENDA_RICARDO = [
  [0, "16:00", 60, "Teresa Domínguez Pérez", "Extracciones", "confirmada"], [0, "17:30", 60, "Rosa Medina", "Implantes", "programada"],
  [1, "10:00", 90, "Elisa Montalvo", "Valoración inicial", "confirmada"], [1, "11:30", 90, "Beatriz Cetina", "Endodoncia", "confirmada"],
  [1, "13:00", 90, "Gabriela Sosa", "Limpieza", "confirmada"], [1, "14:30", 60, "Fernando Albert", "Valoración inicial", "programada"],
  [1, "18:00", 90, "Leticia Cárdenas", "Endodoncia", "confirmada"], [3, "11:30", 90, "Mauricio Herrera", "Endodoncia", "confirmada"],
  [3, "13:30", 60, "Octavio Ruiz Canto", "Valoración inicial", "programada"], [3, "16:30", 60, "Leticia Cárdenas", "Implantes", "confirmada"],
  [4, "10:00", 60, "Daniela Ponce", "Endodoncia", "programada"], [4, "11:00", 90, "Fabiola Lugo", "Endodoncia", "programada"],
  [4, "12:30", 60, "Renata Pech", "Limpieza", "programada"], [2, "15:30", 60, "Hugo Peniche", "Extracciones", "programada"],
  [2, "17:00", 60, "Karina Briceño", "Implantes", "programada"], [9, "11:00", 60, "Alma Quintal", "Valoración inicial", "programada"],
  [4, "14:00", 60, "Carlos Mendoza", "Limpieza", "programada"], [7, "10:00", 90, "Naomi Brown", "Endodoncia", "programada"],
  [7, "16:00", 60, "Iván Chan Poot", "Valoración inicial", "programada"], [8, "11:30", 90, "Ximena Peraza", "Endodoncia", "programada"],
  [10, "10:00", 90, "Héctor Solís", "Endodoncia", "programada"], [11, "16:00", 90, "Arturo Bastos", "Endodoncia", "programada"],
];
const AGENDA_PALOMA = [
  [0, "14:00", 60, "Emilio Barrera", "Ortodoncia", "programada"], [1, "08:00", 60, "Camila Ortega", "Limpieza", "confirmada"],
  [1, "09:00", 60, "Itzel Moguel", "Limpieza", "confirmada"], [1, "10:00", 30, "Rodolfo Tun", "Ortodoncia", "confirmada"],
  [1, "11:00", 30, "Valentina Rivas", "Ortodoncia", "confirmada"], [1, "12:00", 60, "Gael Acosta", "Limpieza", "confirmada"],
  [1, "13:00", 60, "Lourdes Pacheco", "Limpieza", "confirmada"], [1, "14:00", 30, "Bruno Escalante", "Limpieza", "confirmada"],
  [2, "15:30", 30, "Regina Canul", "Ortodoncia", "programada"], [2, "16:00", 30, "Aurora Dzib", "Ortodoncia", "programada"],
  [2, "16:30", 30, "Itzel Moguel", "Ortodoncia", "programada"], [2, "17:00", 30, "Leonel Aké", "Ortodoncia", "programada"],
  [3, "15:00", 120, "Samuel Vela", "Ortodoncia", "confirmada"], [4, "16:00", 30, "Kevin Montejo", "Ortodoncia", "programada"],
  [4, "16:30", 30, "Paulina Cab", "Ortodoncia", "programada"], [4, "17:00", 30, "Guadalupe Euán", "Ortodoncia", "programada"],
  [3, "13:00", 30, "Ana Paula Ek", "Ortodoncia", "programada"], [4, "12:00", 60, "Cecilia Rendón", "Limpieza", "programada"],
  [5, "11:00", 30, "Tomás Villanueva", "Ortodoncia", "programada"], [8, "12:00", 30, "Jimena Salazar", "Ortodoncia", "programada"],
  [8, "12:30", 30, "Mariana Pat", "Ortodoncia", "programada"], [8, "16:00", 30, "Ariadna Moo", "Ortodoncia", "programada"],
  [8, "16:30", 30, "Sandra Lizama", "Ortodoncia", "programada"], [8, "17:00", 30, "Marisol Cen", "Ortodoncia", "programada"],
  [8, "17:30", 30, "Andrés Cetina", "Extracciones", "programada"],
];
const PACIENTES_BASE = [
  ["Ana García", "5551000001", "Valoración inicial", "Penicilina", true], ["Carlos Mendoza", "5551000002", "Limpieza", "Ninguna", false],
  ["Sofía Ramírez", "5551000003", "Ortodoncia", "Látex", true], ["Luis Hernández", "5551000004", "Extracciones", "Ibuprofeno", false],
  ["Mariana López", "5551000005", "Implantes", "Ninguna", true], ["Diego Castro", "5551000006", "Ortodoncia", "Ninguna", false],
  ["Valeria Ruiz", "5551000007", "Valoración inicial", "Sulfas", true], ["Jorge Navarro", "5551000008", "Limpieza", "Ninguna", false],
];
const MOTIVOS = {
  "Valoración inicial": "Primera revisión y plan de tratamiento", Limpieza: "Profilaxis y control de sarro",
  Ortodoncia: "Control de brackets / alineadores", Implantes: "Reposición de pieza perdida",
  Extracciones: "Pieza con movilidad o sin posibilidad de restauración", Endodoncia: "Dolor y sensibilidad en pieza tratada",
};
const NOTAS = [
  "Endodoncia: conductos instrumentados y obturados. Se indica restauración definitiva.",
  "Profilaxis completa. Se refuerza técnica de cepillado e hilo dental.",
  "Control de ortodoncia: arcos cambiados, sin molestias reportadas.",
  "Valoración inicial: se entrega plan de tratamiento por etapas.",
];
const ZONAS = ["vestibular", "lingual", "mesial", "distal", "oclusal"];
const z = (lista, estado) => lista.map((zona) => ({ zona, estado }));
function dientesPara(tratamiento, i) {
  const [principal, segundo, tercero] = i % 2 === 0 ? [46, 16, 17] : [36, 26, 27];
  const lista = {
    Endodoncia: [[principal, z(["oclusal", "mesial", "distal"], "endodoncia")], [segundo, z(["oclusal"], "restaurado")], [18, z(["oclusal"], "caries")]],
    Implantes: [[principal, z(ZONAS, "extraido")], [segundo, z(ZONAS, "corona")], [tercero, z(["distal"], "caries")]],
    Extracciones: [[48, z(ZONAS, "extraido")], [tercero, z(["oclusal", "mesial"], "caries")]],
    Ortodoncia: [[principal, z(["oclusal"], "restaurado")]],
    Limpieza: [[segundo, z(["oclusal"], "restaurado")], [tercero, z(["distal"], "caries")]],
  }[tratamiento] ?? [[tercero, z(["oclusal", "distal"], "caries")], [principal, z(["oclusal"], "restaurado")]];
  return lista.flatMap(([diente, zonas]) => zonas.map((x) => ({ diente, ...x })));
}

const org = await prisma.org.upsert({
  where: { slug: "demo-clinica" },
  update: { nombre: "Serénica Health Center", activo: true },
  create: { nombre: "Serénica Health Center", slug: "demo-clinica" },
});

await prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe("SELECT set_config('app.current_org', $1, true)", String(org.id));
  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await tx.usuario.upsert({
    where: { orgId_email: { orgId: org.id, email } },
    update: { nombre: "Dr. Ricardo Azcorra", passwordHash, rol: "admin", puesto: "Doctor", activo: true },
    create: { nombre: "Dr. Ricardo Azcorra", email, passwordHash, rol: "admin", puesto: "Doctor" },
  });
  await tx.usuario.upsert({
    where: { orgId_email: { orgId: org.id, email: "recepcion@serenica.demo" } },
    update: { nombre: "Recepción Serénica", puesto: "Recepcionista", activo: true },
    create: { nombre: "Recepción Serénica", email: "recepcion@serenica.demo", passwordHash, rol: "agente", puesto: "Recepcionista" },
  });
  await tx.ajustes.upsert({
    where: { orgId: org.id },
    update: { marcaPreset: "salud", marcaNombre: "Serénica Health Center" },
    create: { marcaPreset: "salud", marcaNombre: "Serénica Health Center" },
  });
  for (const [clave, config] of [["citas", { anticipacionHoras: 24 }], ["pacientes", {}],
    ["reservas_en_linea", { anticipacionMin: 120, ventanaDias: 30, granularidadMin: 30, maxPorTelefono: 3 }]]) {
    await tx.moduloOrg.upsert({
      where: { orgId_clave: { orgId: org.id, clave } },
      update: { activo: true, config }, create: { clave, activo: true, config },
    });
  }

  await tx.doctor.updateMany({ where: { nombre: { in: ["Dra. Elena Torres", "Dr. Mateo Salas"] } }, data: { activo: false } });
  const doctor = (datos) => tx.doctor.upsert({
    where: { orgId_nombre: { orgId: org.id, nombre: datos.nombre } }, update: { ...datos, activo: true }, create: datos,
  });
  const ricardo = await doctor({ nombre: "Dr. Ricardo Azcorra", especialidad: "Odontología general y endodoncia", cedula: "PROF-102938", color: "#0EA5E9" });
  const paloma = await doctor({ nombre: "Dra. Paloma", especialidad: "Ortodoncia", cedula: "PROF-564738", color: "#8B5CF6" });

  const definiciones = [
    ["tipo_tratamiento", "Tratamiento", "opcion", Object.keys(MOTIVOS)], ["motivo_consulta", "Motivo de consulta", "texto", []],
    ["alergias", "Alergias", "texto", []], ["ultima_limpieza", "Última limpieza", "fecha", []], ["primera_visita", "Primera visita", "si_no", []],
  ];
  for (const [clave, etiqueta, tipo, opciones] of definiciones) {
    await tx.campoPersonalizado.upsert({
      where: { orgId_entidad_clave: { orgId: org.id, entidad: "contacto", clave } },
      update: { etiqueta, tipo, opciones, activo: true }, create: { entidad: "contacto", clave, etiqueta, tipo, opciones },
    });
  }

  const pacientes = new Map(PACIENTES_BASE.map((p) => [p[0], p]));
  [...AGENDA_RICARDO, ...AGENDA_PALOMA].forEach(([, , , nombre, tratamiento]) => {
    if (!pacientes.has(nombre)) pacientes.set(nombre, [nombre, `55590${String(pacientes.size).padStart(5, "0")}`, tratamiento, "Ninguna reportada", tratamiento === "Valoración inicial"]);
  });
  const contactos = new Map();
  const ultimaLimpieza = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
  let i = 0;
  for (const [nombre, telefono, tratamiento, alergias, primera] of pacientes.values()) {
    const campos = { tipo_tratamiento: tratamiento, motivo_consulta: MOTIVOS[tratamiento], alergias, ultima_limpieza: ultimaLimpieza, primera_visita: primera };
    const contacto = await tx.contacto.upsert({
      where: { orgId_telefono: { orgId: org.id, telefono } },
      update: { nombre, campos },
      create: { nombre, telefono, fuente: "manual", responsableId: admin.id, campos },
    });
    contactos.set(nombre, contacto);
    const expediente = await tx.expedientePaciente.upsert({
      where: { contactoId: contacto.id },
      update: { alergias: String(alergias) },
      create: {
        contactoId: contacto.id, fechaNacimiento: new Date(`${1965 + ((i * 7) % 40)}-0${(i % 9) + 1}-1${i % 9}T00:00:00.000Z`),
        sexo: i % 2 === 0 ? "Femenino" : "Masculino", alergias: String(alergias),
        antecedentes: i % 3 === 0 ? "Hipertensión controlada" : "Sin antecedentes relevantes",
        medicamentos: "Ninguno reportado", observaciones: "Expediente de demostración.",
      },
    });
    await tx.odontogramaZona.deleteMany({ where: { expedienteId: expediente.id } });
    await tx.odontogramaZona.createMany({
      data: dientesPara(tratamiento, i).map((d) => ({ expedienteId: expediente.id, actualizadoPorId: admin.id, ...d })),
      skipDuplicates: true,
    });
    if (i < 8) {
      const contenido = NOTAS[i % NOTAS.length];
      const existe = await tx.evolucionClinica.findFirst({ where: { expedienteId: expediente.id, contenido } });
      if (!existe) {
        await tx.evolucionClinica.create({
          data: { expedienteId: expediente.id, doctorId: (i % 2 ? paloma : ricardo).id, registradoPorId: admin.id, contenido,
            createdAt: new Date(Date.now() - (3 + i) * 86_400_000) },
        });
      }
    }
    i++;
  }

  const servicios = [
    ["Valoración inicial", "Revisión y plan de tratamiento personalizado.", 700, [ricardo]],
    ["Limpieza dental", "El costo se define en la valoración.", 0, [ricardo, paloma]],
    ["Ortodoncia", "Brackets y alineadores.", 0, [paloma]],
    ["Implantes", "El costo se define en la valoración.", 0, [ricardo]],
    ["Extracciones", "El costo se define en la valoración.", 0, [ricardo]],
  ];
  for (const [nombre, descripcion, precio, doctores] of servicios) {
    const servicio = await tx.servicioReserva.upsert({
      where: { orgId_nombre: { orgId: org.id, nombre } },
      update: { descripcion, precio, duracionMin: 60, activo: true },
      create: { nombre, descripcion, precio, duracionMin: 60, bufferMin: 0 },
    });
    await tx.servicioReservaDoctor.deleteMany({ where: { servicioId: servicio.id } });
    await tx.servicioReservaDoctor.createMany({ data: doctores.map((d) => ({ servicioId: servicio.id, doctorId: d.id })) });
  }

  await tx.horarioDoctor.deleteMany({ where: { doctorId: { in: [ricardo.id, paloma.id] } } });
  await tx.horarioDoctor.createMany({
    data: [
      ...[1, 2, 3, 4, 5].flatMap((dia) => [
        { doctorId: ricardo.id, diaSemana: dia, inicioMin: 600, finMin: 1080 },
        { doctorId: paloma.id, diaSemana: dia, inicioMin: 660, finMin: 1080 },
      ]),
      { doctorId: ricardo.id, diaSemana: 6, inicioMin: 600, finMin: 780 },
      { doctorId: paloma.id, diaSemana: 6, inicioMin: 660, finMin: 780 },
    ],
  });
  await tx.excepcionHorario.deleteMany({ where: { doctorId: { in: [ricardo.id, paloma.id] } } });
  const bloqueo = (doctorId, dia, inicioMin, finMin, motivo) => ({ doctorId, fecha: fechaEstaSemana(dia, 12), inicioMin, finMin, motivo });
  await tx.excepcionHorario.createMany({
    data: [
      bloqueo(ricardo.id, 2, 540, 900, "Curso"), bloqueo(ricardo.id, 5, 600, 840, "Bloqueado / no citar"),
      bloqueo(ricardo.id, 12, 600, 840, "Bloqueado / no citar"), bloqueo(paloma.id, 2, 540, 900, "Curso de experiencia del cliente"),
      ...[9, 10, 11].map((dia) => bloqueo(paloma.id, dia, null, null, "Clearcorrect experience")),
    ],
  });

  await tx.cita.deleteMany({});
  const citas = [...AGENDA_RICARDO.map((f) => [f, ricardo]), ...AGENDA_PALOMA.map((f) => [f, paloma])].map(([fila, doc], n) => {
    const [dia, hora, minutos, nombre, tratamiento, estado] = fila;
    const [h, m] = hora.split(":").map(Number);
    const inicio = new Date(fechaEstaSemana(dia, h).getTime() + m * 60_000);
    return { contactoId: contactos.get(nombre).id, responsableId: admin.id, doctorId: doc.id, titulo: `${tratamiento} · ${nombre}`,
      inicio, fin: new Date(inicio.getTime() + minutos * 60_000), estado };
  });
  await tx.cita.createMany({ data: citas });
}, { timeout: 120_000, maxWait: 20_000 });

imprimirCredencialesDemo({ nombre: "Serénica (demo-clinica)", slug: "demo-clinica", email, password, passwordGenerada });
await prisma.$disconnect();
