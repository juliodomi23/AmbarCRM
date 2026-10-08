import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const [email, password] = process.argv.slice(2);
if (!email || !password) throw new Error("Uso: node scripts/seed-demo-academia.mjs <email> <contraseña>");
const prisma = new PrismaClient();
const org = await prisma.org.upsert({
  where: { slug: "demo-academia" },
  update: { nombre: "Academia Faro", activo: true },
  create: { slug: "demo-academia", nombre: "Academia Faro" },
});

await prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe("SELECT set_config('app.current_org', $1, true)", String(org.id));
  const passwordHash = await bcrypt.hash(password, 10);
  await tx.usuario.upsert({
    where: { orgId_email: { orgId: org.id, email } },
    update: { passwordHash, activo: true, puesto: "Coordinador académico", rol: "admin" },
    create: { nombre: "Laura Méndez", email, passwordHash, puesto: "Coordinador académico", rol: "admin" },
  });
  await tx.ajustes.upsert({
    where: { orgId: org.id },
    update: { marcaNombre: "Academia Faro", nombreNegocio: "Academia Faro" },
    create: { marcaNombre: "Academia Faro", nombreNegocio: "Academia Faro" },
  });
  for (const clave of ["alumnos", "cursos_academia", "inscripciones_academia", "colegiaturas", "asistencia_academia"]) {
    await tx.moduloOrg.upsert({
      where: { orgId_clave: { orgId: org.id, clave } },
      update: { activo: true }, create: { clave, activo: true, config: {} },
    });
  }
  const alumnos = [];
  for (const [indice, nombre] of ["Camila Torres", "Diego Luna", "Renata Solís", "Mateo Ríos"].entries()) {
    const telefono = `555830000${indice + 1}`;
    const contacto = await tx.contacto.upsert({
      where: { orgId_telefono: { orgId: org.id, telefono } },
      update: { nombre }, create: { nombre, telefono, fuente: "manual" },
    });
    alumnos.push(await tx.alumnoAcademia.upsert({
      where: { contactoId: contacto.id },
      update: { estado: "activo" },
      create: {
        contactoId: contacto.id,
        matricula: `AF-00${indice + 1}`,
        nivel: indice < 2 ? "Inicial" : "Intermedio",
        tutorNombre: `Tutor ${indice + 1}`,
      },
    }));
  }
  const cursos = [];
  for (const datos of [
    {
      clave: "ING-A1", nombre: "Inglés inicial", categoria: "Idiomas",
      profesor: "Mtra. Elisa Prado", horario: "Lun y mié 17:00",
      capacidad: 12, mensualidad: 1450,
    },
    {
      clave: "MAT-01", nombre: "Matemáticas prácticas", categoria: "Regularización",
      profesor: "Prof. Iván Mora", horario: "Mar y jue 16:00",
      capacidad: 10, mensualidad: 1200,
    },
  ]) {
    cursos.push(await tx.cursoAcademia.upsert({
      where: { orgId_clave: { orgId: org.id, clave: datos.clave } },
      update: datos,
      create: datos,
    }));
  }
  for (let indice = 0; indice < alumnos.length; indice += 1) {
    const curso = cursos[indice % cursos.length];
    const inscripcion = await tx.inscripcionAcademia.upsert({
      where: { alumnoId_cursoId: { alumnoId: alumnos[indice].id, cursoId: curso.id } },
      update: { estado: "activa", avance: 20 + indice * 15 },
      create: { alumnoId: alumnos[indice].id, cursoId: curso.id, avance: 20 + indice * 15 },
    });
    const sinColegiatura = await tx.colegiaturaAcademia.count({
      where: { inscripcionId: inscripcion.id },
    }) === 0;
    if (sinColegiatura) {
      await tx.colegiaturaAcademia.create({ data: {
        alumnoId: alumnos[indice].id, inscripcionId: inscripcion.id,
        concepto: "Colegiatura mensual", periodo: "Octubre 2026", monto: curso.mensualidad,
        vencimiento: new Date("2026-10-10T12:00:00Z"), estado: indice < 2 ? "pagada" : "pendiente",
        pagadoEn: indice < 2 ? new Date() : null,
      } });
    }
    await tx.asistenciaAcademia.upsert({
      where: { alumnoId_cursoId_fecha: {
        alumnoId: alumnos[indice].id,
        cursoId: curso.id,
        fecha: new Date("2026-10-07T12:00:00Z"),
      } },
      update: { estado: indice === 3 ? "retardo" : "presente" },
      create: {
        alumnoId: alumnos[indice].id,
        cursoId: curso.id,
        fecha: new Date("2026-10-07T12:00:00Z"),
        estado: indice === 3 ? "retardo" : "presente",
      },
    });
  }
}, { timeout: 60_000 });

console.log("demo academia lista: /login?org=demo-academia");
await prisma.$disconnect();
