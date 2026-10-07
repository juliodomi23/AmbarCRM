// Uso: node scripts/seed-demo-clinica.mjs admin@demo.test ClaveSegura
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const [email, password] = process.argv.slice(2);
if (!email || !password)
  throw new Error(
    "Uso: node scripts/seed-demo-clinica.mjs <email> <contraseña>",
  );
const prisma = new PrismaClient();
const ZONA = "America/Mexico_City";

function fechaEstaSemana(diaDesdeLunes, hora) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: ZONA,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map((parte) => [parte.type, parte.value]),
  );
  const base = new Date(
    Date.UTC(Number(partes.year), Number(partes.month) - 1, Number(partes.day)),
  );
  base.setUTCDate(
    base.getUTCDate() - ((base.getUTCDay() + 6) % 7) + diaDesdeLunes,
  );
  return new Date(
    `${base.toISOString().slice(0, 10)}T${String(hora).padStart(2, "0")}:00:00-06:00`,
  );
}

const diaHoy = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(
  new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: ZONA }).format(
    new Date(),
  ),
);
const org = await prisma.org.upsert({
  where: { slug: "demo-clinica" },
  update: { nombre: "Clínica Horizonte", activo: true },
  create: { nombre: "Clínica Horizonte", slug: "demo-clinica" },
});

await prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe(
    "SELECT set_config('app.current_org', $1, true)",
    String(org.id),
  );
  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await tx.usuario.upsert({
    where: { orgId_email: { orgId: org.id, email } },
    update: {
      nombre: "Dra. Elena Torres",
      passwordHash,
      rol: "admin",
      activo: true,
    },
    create: { nombre: "Dra. Elena Torres", email, passwordHash, rol: "admin" },
  });
  await tx.ajustes.upsert({
    where: { orgId: org.id },
    update: { marcaPreset: "salud", marcaNombre: "Clínica Horizonte" },
    create: { marcaPreset: "salud", marcaNombre: "Clínica Horizonte" },
  });
  await tx.moduloOrg.upsert({
    where: { orgId_clave: { orgId: org.id, clave: "citas" } },
    update: { activo: true },
    create: { clave: "citas", activo: true, config: { anticipacionHoras: 24 } },
  });

  const definiciones = [
    [
      "tipo_tratamiento",
      "Tipo de tratamiento",
      "opcion",
      ["Consulta", "Limpieza", "Ortodoncia"],
    ],
    ["alergias", "Alergias", "texto", []],
    ["primera_visita", "Primera visita", "si_no", []],
  ];
  for (const [clave, etiqueta, tipo, opciones] of definiciones) {
    await tx.campoPersonalizado.upsert({
      where: {
        orgId_entidad_clave: { orgId: org.id, entidad: "contacto", clave },
      },
      update: { etiqueta, tipo, opciones, activo: true },
      create: { entidad: "contacto", clave, etiqueta, tipo, opciones },
    });
  }

  let embudo = await tx.embudo.findFirst({ where: { nombre: "Pacientes" } });
  if (!embudo)
    embudo = await tx.embudo.create({
      data: { nombre: "Pacientes", orden: 1 },
    });
  const etapasDatos = [
    ["Nuevo contacto", "normal"],
    ["Valoración agendada", "normal"],
    ["En tratamiento", "normal"],
    ["Tratamiento completado", "ganado"],
  ];
  const etapas = [];
  for (let i = 0; i < etapasDatos.length; i++) {
    const [nombre, tipo] = etapasDatos[i];
    const existente = await tx.etapa.findFirst({
      where: { embudoId: embudo.id, nombre },
    });
    etapas.push(
      existente ??
        (await tx.etapa.create({
          data: { embudoId: embudo.id, nombre, tipo, orden: i + 1 },
        })),
    );
  }

  const pacientes = [
    ["Ana García", "5551000001", "Consulta", "Penicilina", true],
    ["Carlos Mendoza", "5551000002", "Limpieza", "Ninguna", false],
    ["Sofía Ramírez", "5551000003", "Ortodoncia", "Látex", true],
    ["Luis Hernández", "5551000004", "Consulta", "Ibuprofeno", false],
    ["Mariana López", "5551000005", "Limpieza", "Ninguna", true],
    ["Diego Castro", "5551000006", "Ortodoncia", "Ninguna", false],
    ["Valeria Ruiz", "5551000007", "Consulta", "Sulfas", true],
    ["Jorge Navarro", "5551000008", "Limpieza", "Ninguna", false],
  ];
  const contactos = [];
  for (const [nombre, telefono, tratamiento, alergias, primera] of pacientes) {
    contactos.push(
      await tx.contacto.upsert({
        where: { orgId_telefono: { orgId: org.id, telefono } },
        update: {
          nombre,
          campos: {
            tipo_tratamiento: tratamiento,
            alergias,
            primera_visita: primera,
          },
        },
        create: {
          nombre,
          telefono,
          fuente: "manual",
          responsableId: admin.id,
          campos: {
            tipo_tratamiento: tratamiento,
            alergias,
            primera_visita: primera,
          },
        },
      }),
    );
  }

  for (let i = 0; i < 6; i++) {
    const titulo = `${pacientes[i][2]} · ${pacientes[i][0]}`;
    const etapa = etapas[i % etapas.length];
    const existente = await tx.oportunidad.findFirst({
      where: { contactoId: contactos[i].id, titulo },
    });
    const data = {
      contactoId: contactos[i].id,
      embudoId: embudo.id,
      etapaId: etapa.id,
      titulo,
      valor: 800 + i * 650,
      responsableId: admin.id,
      estado: etapa.tipo === "ganado" ? "ganado" : "abierto",
    };
    if (existente)
      await tx.oportunidad.update({ where: { id: existente.id }, data });
    else await tx.oportunidad.create({ data });
  }

  const dias = [diaHoy, diaHoy, 0, 1, 2, 3, 4, 5];
  const horas = [9, 11, 10, 14, 16, 12, 15, 17];
  for (let i = 0; i < contactos.length; i++) {
    const titulo = `${pacientes[i][2]} de ${pacientes[i][0]}`;
    const inicio = fechaEstaSemana(dias[i], horas[i]);
    const data = {
      contactoId: contactos[i].id,
      responsableId: admin.id,
      titulo,
      inicio,
      fin: new Date(inicio.getTime() + 45 * 60_000),
    };
    const existente = await tx.cita.findFirst({
      where: { contactoId: contactos[i].id, titulo },
    });
    if (existente) await tx.cita.update({ where: { id: existente.id }, data });
    else await tx.cita.create({ data });
  }

  const historiales = [
    [
      "Hola, quisiera agendar una valoración",
      "Claro, tenemos espacio esta semana",
      "Perfecto, gracias",
    ],
    [
      "¿Cuánto cuesta una limpieza?",
      "La valoración inicial no tiene costo",
      "Quiero reservar",
    ],
    [
      "Necesito información de ortodoncia",
      "Revisamos tu caso en consulta",
      "¿Puede ser por la tarde?",
    ],
  ];
  for (let i = 0; i < 3; i++) {
    let conversacion = await tx.conversacion.findFirst({
      where: { contactoId: contactos[i].id },
    });
    if (!conversacion)
      conversacion = await tx.conversacion.create({
        data: {
          contactoId: contactos[i].id,
          responsableId: admin.id,
          ultimoMensajeAt: new Date(),
        },
      });
    for (let j = 0; j < historiales[i].length; j++) {
      const contenido = historiales[i][j];
      if (
        !(await tx.mensaje.findFirst({
          where: { conversacionId: conversacion.id, contenido },
        }))
      ) {
        await tx.mensaje.create({
          data: {
            conversacionId: conversacion.id,
            direccion: j % 2 === 0 ? "entrante" : "saliente",
            contenido,
            enviadoPor: j % 2 === 0 ? null : admin.id,
            timestamp: new Date(
              Date.now() - (historiales[i].length - j) * 60_000,
            ),
          },
        });
      }
    }
  }
});

console.log("Demo lista: /login?org=demo-clinica", email);
await prisma.$disconnect();
