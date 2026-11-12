// Uso opcional: ALLOW_DEMO_SEED=1 node scripts/seed-demo-auditoria.mjs correo contraseña
// Reutiliza los colaboradores sembrados por seed-demo-despacho.mjs y seed-demo-contenido.mjs.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { credencialesDemo } from "./lib/demo-seed.mjs";

const { email, password, passwordGenerada } = credencialesDemo("refmex@local.test");
const prisma = new PrismaClient();
const SLUG = process.env.ORG_SLUG || "refmex";

function hoyMexico() {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit" }).format(new Date());
  const [anio, mes] = partes.split("-").map(Number);
  return { anio, mes };
}

function periodoDe(anio, mes, atras) {
  return new Date(Date.UTC(anio, mes - 1 - atras, 1, 12));
}

const PLAN = [
  {
    area: "contabilidad",
    correos: ["dario@refmex.demo", "nelson@refmex.demo", "juanjose@refmex.demo", "abner@refmex.demo", "estelita@refmex.demo", "berenice@refmex.demo", "jennifer@refmex.demo", "ariana@refmex.demo", "tania@refmex.demo"],
  },
  {
    area: "administracion",
    correos: ["ernesto@refmex.demo", "lusmi@refmex.demo"],
  },
  {
    area: "marketing",
    correos: ["tifani@refmex.demo", "wendy@refmex.demo"],
  },
  {
    area: "adquisicion",
    correos: ["ernesto@refmex.demo", "silvia@refmex.demo"],
  },
];

// Administración y Adquisición no las siembra ningún otro script: se crean aquí.
const EQUIPO_PROPIO = [
  ["Ernesto Alonso Alvarado Hernández", "ernesto@refmex.demo", "Responsable administrativo"],
  ["Lusmi Vazquez Roblero", "lusmi@refmex.demo", "Auxiliar administrativo"],
  ["Silvia", "silvia@refmex.demo", "Encargada de compras"],
];

const COLORES = ["verde", "verde", "amarillo", "verde", "rojo", "amarillo", "gris_na", "verde"];

const NOTAS = {
  verde: ["Entregado en tiempo y forma.", "Cumplimiento completo del periodo.", "Sin observaciones."],
  amarillo: ["Se entregó con observaciones; se solicitaron correcciones.", "Cumplió parcialmente el proceso del periodo.", "Faltó documentación complementaria."],
  rojo: ["No se entregó la documentación en la fecha acordada.", "La tarea quedó pendiente sin aviso previo.", "No se realizó la actividad comprometida."],
  gris_na: ["No aplica: descanso o tarea ajena al área.", "No corresponde al colaborador en este periodo."],
};

const org = await prisma.org.upsert({
  where: { slug: SLUG },
  update: { nombre: "REFMEX", activo: true },
  create: { nombre: "REFMEX", slug: SLUG },
});

const { anio, mes } = hoyMexico();
let adminCreado = false;
let totalEvaluaciones = 0;

await prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe("SELECT set_config('app.current_org', $1, true)", String(org.id));
  const passwordHash = await bcrypt.hash(password, 10);

  let admin = await tx.usuario.findFirst({
    where: { orgId: org.id, email },
    select: { id: true, email: true },
  });
  if (!admin) {
    admin = await tx.usuario.create({
      data: { nombre: "Adrián Felipe Jiménez López", email, passwordHash, rol: "admin", puesto: "Director general" },
      select: { id: true, email: true },
    });
    adminCreado = true;
  }

  for (const [nombre, correo, puesto] of EQUIPO_PROPIO) {
    await tx.usuario.upsert({
      where: { orgId_email: { orgId: org.id, email: correo } },
      update: { nombre, puesto, activo: true },
      create: { nombre, email: correo, passwordHash, rol: "agente", puesto },
    });
  }

  const correos = [...new Set(PLAN.flatMap((bloque) => bloque.correos))];
  const usuarios = await tx.usuario.findMany({
    where: { orgId: org.id, email: { in: correos } },
    select: { id: true, email: true },
  });
  const porCorreo = new Map(usuarios.map((usuario) => [usuario.email, usuario]));
  const cartagena = await tx.usuario.findFirst({ where: { orgId: org.id, email: "cartagena@refmex.demo" }, select: { id: true } });
  const evaluador = cartagena ?? admin;

  if (!usuarios.length) {
    throw new Error("No hay colaboradores demo. Ejecuta primero seed-demo-despacho.mjs y seed-demo-contenido.mjs");
  }

  for (const clave of ["auditoria"]) {
    await tx.moduloOrg.upsert({
      where: { orgId_clave: { orgId: org.id, clave } },
      update: { activo: true },
      create: { clave, activo: true, config: {} },
    });
  }

  const lusmi = await tx.usuario.findFirst({
    where: { orgId: org.id, email: "lusmi@refmex.demo", activo: true },
    select: { id: true },
  });
  const moduloDespacho = await tx.moduloOrg.findFirst({ where: { clave: "despacho", activo: true } });
  if (lusmi && moduloDespacho) {
    const configActual = moduloDespacho.config && typeof moduloDespacho.config === "object" && !Array.isArray(moduloDespacho.config)
      ? moduloDespacho.config
      : {};
    const acceso = new Set([...(Array.isArray(configActual.usuariosAccesoTotal) ? configActual.usuariosAccesoTotal.map(String) : []), String(lusmi.id)]);
    const confirmadores = new Set([...(Array.isArray(configActual.usuariosConfirmadores) ? configActual.usuariosConfirmadores.map(String) : []), String(lusmi.id)]);
    await tx.moduloOrg.update({
      where: { id: moduloDespacho.id },
      data: { config: { ...configActual, usuariosAccesoTotal: [...acceso], usuariosConfirmadores: [...confirmadores] } },
    });
  }

  for (const [areaIndice, bloque] of PLAN.entries()) {
    const colaboradores = [...new Set(bloque.correos)].map((correo) => porCorreo.get(correo)).filter(Boolean);
    for (const [indice, colaborador] of colaboradores.entries()) {
      for (const atras of [2, 1, 0]) {
        const color = COLORES[(indice + areaIndice * 2 + atras) % COLORES.length];
        const notas = NOTAS[color];
        const nota = notas[(indice + atras) % notas.length];
        const periodo = periodoDe(anio, mes, atras);
        const evaluadorId = colaborador.id === evaluador.id ? admin.id : evaluador.id;
        await tx.auditoriaEvaluacion.upsert({
          where: {
            orgId_colaboradorId_area_periodo: {
              orgId: org.id,
              colaboradorId: colaborador.id,
              area: bloque.area,
              periodo,
            },
          },
          update: { color, nota, evaluadorId },
          create: {
            orgId: org.id,
            colaboradorId: colaborador.id,
            evaluadorId,
            area: bloque.area,
            periodo,
            color,
            nota,
          },
        });
      }
    }
  }

  totalEvaluaciones = await tx.auditoriaEvaluacion.count({ where: { orgId: org.id } });
}, { timeout: 60000 });

console.log(`Demo Auditoría lista: /login?org=${SLUG}`);
console.log(`Correo evaluador: ${email}`);
if (adminCreado) {
  console.log(`Contraseña${passwordGenerada ? " aleatoria" : ""}: ${password}`);
} else {
  console.log("Usa la contraseña existente de ese usuario.");
}
console.log(`Evaluaciones de auditoría: ${totalEvaluaciones}`);
await prisma.$disconnect();
