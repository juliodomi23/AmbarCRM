// Uso: MES=2026-10 ORG_SLUG=refmex node scripts/seed-refmex-despacho-mes.mjs
// Aplica: MES=2026-10 ORG_SLUG=refmex node scripts/seed-refmex-despacho-mes.mjs --apply
//
// Genera las actividades del mes con los procesos ya asignados a cada cliente y deja
// un avance realista: 60% completadas y confirmadas, 10% completadas por confirmar,
// 20% pendientes y 10% en proceso o bloqueadas (atrasadas porque el mes ya cerró).
// Es idempotente: no duplica actividades y solo cambia las que siguen vírgenes.
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
const orgSlug = process.env.ORG_SLUG || "refmex";
const mes = process.env.MES || "2026-10";
const aplicar = process.argv.includes("--apply");
const CONFIRMADORES = [82n, 124n];
const DIA = 86400000;

function iso(anio, mesNumero, dia) {
  return new Date(Date.UTC(anio, mesNumero - 1, dia)).toISOString().slice(0, 10);
}

function partesTexto(fecha) {
  const partes = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(String(fecha).trim());
  return partes ? { y: Number(partes[1]), m: Number(partes[2]), d: Number(partes[3] ?? 1) } : { y: 1970, m: 1, d: 1 };
}

function ultimoDia(anio, mesNumero) {
  return new Date(Date.UTC(anio, mesNumero, 0)).getUTCDate();
}

function periodoDe(fecha, periodicidad) {
  const { y, m } = partesTexto(fecha);
  if (periodicidad === "mensual") return iso(y, m, 1);
  if (periodicidad === "bimestral") return iso(y, m % 2 === 1 ? m : m - 1, 1);
  if (periodicidad === "trimestral") return iso(y, Math.floor((m - 1) / 3) * 3 + 1, 1);
  if (periodicidad === "anual") return iso(y, 1, 1);
  return iso(y, m, 1);
}

function fechaLimiteDe(periodo, diaLimite, periodicidad) {
  const { y, m } = partesTexto(periodo);
  const dia = Math.min(Math.max(Math.trunc(diaLimite), 1), ultimoDia(y, m));
  return iso(y, m, dia);
}

function aFecha(valor) {
  return new Date(`${valor}T00:00:00.000Z`);
}

function claveFecha(fecha) {
  return fecha.toISOString().slice(0, 10);
}

function claveActividad(clienteId, plantillaId, periodo) {
  return `${clienteId}:${plantillaId}:${claveFecha(periodo)}`;
}

function planDeEstado(cubo) {
  if (cubo < 60) return "confirmada";
  if (cubo < 70) return "completada";
  if (cubo < 90) return "pendiente";
  if (cubo < 97) return "en_proceso";
  return "bloqueada";
}

function estadoFinal(actividad) {
  const tipo = planDeEstado(Number(actividad.id % 100n));
  if (tipo === "confirmada" || tipo === "completada") {
    const limite = new Date(`${claveFecha(actividad.fechaLimite)}T18:00:00.000Z`);
    const inicio = new Date(`${claveFecha(actividad.periodo)}T18:00:00.000Z`);
    const completadaAt = new Date(Math.max(inicio.getTime(), limite.getTime() - Number(actividad.id % 3n) * DIA));
    if (tipo === "completada") return { estado: "completada", completadaAt, confirmadaAt: null, confirmadaPorId: null };
    return {
      estado: "completada",
      completadaAt,
      confirmadaAt: new Date(completadaAt.getTime() + DIA),
      confirmadaPorId: CONFIRMADORES[Number(actividad.id % BigInt(CONFIRMADORES.length))],
    };
  }
  return { estado: tipo, completadaAt: null, confirmadaAt: null, confirmadaPorId: null };
}

async function main() {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new Error(`MES inválido: ${mes}. Usa YYYY-MM.`);

  const org = await prisma.org.findUnique({ where: { slug: orgSlug }, select: { id: true, nombre: true, slug: true, activo: true } });
  if (!org || !org.activo) throw new Error(`La organización activa “${orgSlug}” no existe.`);
  if (!aplicar) console.log("MODO DRY-RUN: no se escribirá ningún dato. Usa --apply para sembrar el mes.");

  const resultado = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.current_org', $1, true)", String(org.id));

    const clientes = await tx.despachoCliente.findMany({
      where: { activo: true },
      include: {
        procesos: {
          where: { activo: true },
          include: {
            proceso: {
              include: { actividades: { where: { activo: true }, orderBy: [{ orden: "asc" }, { id: "asc" }] } },
            },
          },
        },
      },
    });

    const datos = [];
    for (const cliente of clientes) {
      for (const asignacion of cliente.procesos) {
        if (!asignacion.proceso.activo) continue;
        const periodicidad = asignacion.proceso.periodicidad;
        const periodo = periodoDe(mes, periodicidad);
        if (!periodo.startsWith(mes)) continue;
        for (const plantilla of asignacion.proceso.actividades) {
          datos.push({
            clienteId: cliente.id,
            clienteProcesoId: asignacion.id,
            plantillaActividadId: plantilla.id,
            tipo: "fija",
            titulo: plantilla.nombre,
            periodo: aFecha(periodo),
            fechaLimite: aFecha(fechaLimiteDe(periodo, plantilla.diaLimite, periodicidad)),
            peso: plantilla.peso,
            responsableId: asignacion.responsableId ?? cliente.responsableId,
          });
        }
      }
    }

    const existentes = await tx.despachoActividad.findMany({
      where: { periodo: { gte: aFecha(`${mes}-01`), lt: new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 1)) } },
      select: { clienteId: true, plantillaActividadId: true, periodo: true },
    });
    const clavesExistentes = new Set(existentes.map((actividad) => claveActividad(actividad.clienteId, actividad.plantillaActividadId, actividad.periodo)));
    const faltantes = datos.filter((dato) => !clavesExistentes.has(claveActividad(dato.clienteId, dato.plantillaActividadId, dato.periodo)));

    const plan = {
      org: org.slug,
      mes,
      clientesActivos: clientes.length,
      actividadesEsperadas: datos.length,
      actividadesExistentes: datos.length - faltantes.length,
      actividadesPorCrear: faltantes.length,
      dryRun: !aplicar,
    };
    if (!aplicar) return plan;

    const creadas = faltantes.length
      ? await tx.despachoActividad.createMany({ data: faltantes, skipDuplicates: true })
      : { count: 0 };

    const actividades = await tx.despachoActividad.findMany({
      where: {
        periodo: { gte: aFecha(`${mes}-01`), lt: new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 1)) },
        estado: "pendiente",
        completadaAt: null,
        confirmadaAt: null,
      },
      select: { id: true, periodo: true, fechaLimite: true },
    });

    const porEstado = {};
    let actualizadas = 0;
    for (const actividad of actividades) {
      const cambio = estadoFinal(actividad);
      porEstado[cambio.estado] = (porEstado[cambio.estado] ?? 0) + 1;
      await tx.despachoActividad.update({
        where: { id: actividad.id },
        data: {
          estado: cambio.estado,
          completadaAt: cambio.completadaAt,
          confirmadaAt: cambio.confirmadaAt,
          confirmadaPorId: cambio.confirmadaPorId,
          version: { increment: 1 },
        },
      });
      actualizadas += 1;
    }

    return { ...plan, dryRun: false, actividadesCreadas: creadas.count, actividadesActualizadas: actualizadas, porEstado };
  }, { timeout: 180000 });

  console.log(JSON.stringify(resultado, null, 2));
  if (!aplicar) console.log("Para aplicar: agrega --apply al mismo comando.");
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
