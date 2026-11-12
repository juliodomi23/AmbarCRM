import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
const orgSlug = process.env.ORG_SLUG || "refmex";
const aplicar = process.argv.includes("--apply");
const esProduccion = process.env.NODE_ENV === "production";

const RESPONSABLES = {
  dario: { etiqueta: "Darío", variable: "RESPONSABLE_DARIO_EMAIL", aliases: ["dario"] },
  juanJose: { etiqueta: "Juan José", variable: "RESPONSABLE_JUAN_JOSE_EMAIL", aliases: ["juan jose", "juanjose"] },
  nelson: { etiqueta: "Nelson", variable: "RESPONSABLE_NELSON_EMAIL", aliases: ["nelson"] },
  victor: { etiqueta: "Víctor", variable: "RESPONSABLE_VICTOR_EMAIL", aliases: ["cartagena", "victor manuel"] },
  abner: { etiqueta: "Abner", variable: "RESPONSABLE_ABNER_EMAIL", aliases: ["abner"] },
};

const CLIENTES = [
  ["Darío", ["Victor Hugo", "Tuchtlan", "Dylcia Navarro", "Keyla Alemán", "Peritajes", "Abigail Soria", "Govi Comunicaciones", "Boca negra"]],
  ["Juan José", ["Monica Rodrigues", "Sonia Ramirez", "Brenda Ramirez", "Edgar Solis", "Esdras Escobar", "Victor Nieto", "Bertha Nieto", "Luis Consospo", "Mauricio Escamilla", "Ana Correa", "Emanuel Fernandez", "Jonhkani"]],
  ["Nelson", ["Estes Industries", "David Nanguelu", "Eder Martinez", "Sante Servicios Sanitarios", "Jimenez Consultores", "Jennifer Martinez", "Rogelio Campos", "Adrian Felipe Jimenez", "Edwin Mongue", "Eliseo López"]],
  ["Víctor", ["Ariel Gutiérrez", "Maquinados", "Ingeniería Especializada", "Paola de Jesús López Pineda", "Marco", "Medrano"]],
  ["Abner", ["VSA", "Rodolfo Delgadillo", "Jaime Macias", "Bertha Tinoco", "Jesica Quiroz", "Ralda Elizabeth"]],
];

const ACTIVIDADES_INTERNAS = [
  ["Nelson", "Factura de honorarios del despacho"],
  ["Víctor", "Supervisar seguimiento de actividades"],
];

function normalizar(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-MX")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function fechaMexico() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function primerDiaMes(fecha) {
  return `${fecha.slice(0, 7)}-01`;
}

function comoFecha(valor) {
  return new Date(`${valor}T00:00:00.000Z`);
}

function resolverResponsable(usuarios, clave) {
  const regla = RESPONSABLES[clave];
  const correo = process.env[regla.variable]?.trim().toLocaleLowerCase("es-MX");
  const candidatos = correo
    ? usuarios.filter((usuario) => usuario.email.toLocaleLowerCase("es-MX") === correo)
    : usuarios.filter((usuario) => {
      const nombre = normalizar(usuario.nombre);
      const email = normalizar(usuario.email.split("@")[0]);
      return regla.aliases.some((alias) => nombre.includes(normalizar(alias)) || email.includes(normalizar(alias)));
    });
  if (candidatos.length !== 1) {
    const disponibles = usuarios.map((usuario) => `${usuario.nombre} <${usuario.email}>`).join("; ");
    const causa = correo ? `No existe una cuenta activa con ${regla.variable}=${correo}.` : `No pude resolver de forma única a ${regla.etiqueta}.`;
    throw new Error(`${causa} Define ${regla.variable} con el correo correcto. Usuarios activos: ${disponibles}`);
  }
  return candidatos[0];
}

function contactoCoincidente(contactos, nombre) {
  const clave = normalizar(nombre);
  const coincidencias = contactos.filter((contacto) =>
    normalizar(contacto.nombre) === clave || normalizar(contacto.empresa) === clave,
  );
  const unicos = [...new Map(coincidencias.map((contacto) => [String(contacto.id), contacto])).values()];
  if (unicos.length > 1) {
    throw new Error(`Hay más de un contacto parecido a “${nombre}”. Revisa la ficha y resuelve los duplicados antes de aplicar.`);
  }
  return unicos[0] ?? null;
}

async function main() {
  if (esProduccion && !process.env.ORG_SLUG) throw new Error("En producción especifica ORG_SLUG para evitar cargar datos en una organización equivocada.");
  if (esProduccion && aplicar && process.env.ALLOW_PROD_DISPATCH_SEED !== "1") {
    throw new Error("En producción, --apply requiere ALLOW_PROD_DISPATCH_SEED=1. Sin --apply el script solo simula cambios.");
  }
  if (!aplicar) console.log("MODO DRY-RUN: no se escribirá ningún dato. Usa --apply para aplicar la cartera.");

  const org = await prisma.org.findUnique({ where: { slug: orgSlug }, select: { id: true, nombre: true, slug: true, activo: true } });
  if (!org || !org.activo) throw new Error(`La organización activa “${orgSlug}” no existe.`);

  const resultado = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('app.current_org', $1, true)", String(org.id));
    const [usuarios, contactos, clientesDespacho] = await Promise.all([
      tx.usuario.findMany({ where: { activo: true }, select: { id: true, nombre: true, email: true } }),
      tx.contacto.findMany({ select: { id: true, nombre: true, empresa: true } }),
      tx.despachoCliente.findMany({ select: { id: true, contactoId: true, responsableId: true, activo: true } }),
    ]);
    const responsables = Object.fromEntries(Object.keys(RESPONSABLES).map((clave) => [clave, resolverResponsable(usuarios, clave)]));
    const claveResponsable = new Map(Object.entries(RESPONSABLES).map(([clave, regla]) => [normalizar(regla.etiqueta), clave]));
    const clientePorContacto = new Map(clientesDespacho.map((cliente) => [String(cliente.contactoId), cliente]));
    const clientesPlan = CLIENTES.flatMap(([etiqueta, nombres]) => {
      const clave = claveResponsable.get(normalizar(etiqueta));
      const responsable = responsables[clave];
      return nombres.map((nombre) => {
        const contacto = contactoCoincidente(contactos, nombre);
        const cliente = contacto ? clientePorContacto.get(String(contacto.id)) ?? null : null;
        return { nombre, responsable, contacto, cliente };
      });
    });

    const contactoInterno = contactoCoincidente(contactos, "Despacho interno");
    const clienteInterno = contactoInterno ? clientePorContacto.get(String(contactoInterno.id)) ?? null : null;
    const plan = {
      org: org.slug,
      clientes: clientesPlan.length,
      actividadesInternas: ACTIVIDADES_INTERNAS.length,
      clientesPorResponsable: Object.fromEntries(CLIENTES.map(([etiqueta, nombres]) => [etiqueta, nombres.length])),
      responsables: Object.fromEntries(Object.entries(responsables).map(([clave, usuario]) => [RESPONSABLES[clave].etiqueta, { email: usuario.email, id: String(usuario.id) }])),
      clientesNuevos: clientesPlan.filter((item) => !item.contacto).map((item) => item.nombre),
      clientesExistentes: clientesPlan.filter((item) => item.contacto).length,
      asignacionesACambiar: clientesPlan.filter((item) => item.cliente && String(item.cliente.responsableId ?? "") !== String(item.responsable.id)).length,
      clientesInactivos: clientesPlan.filter((item) => item.cliente && !item.cliente.activo).length,
      clienteInterno: contactoInterno ? "reutilizar" : "crear",
      dryRun: !aplicar,
    };
    if (!aplicar) return plan;

    let creados = 0;
    let actualizados = 0;
    let reactivados = 0;
    for (const item of clientesPlan) {
      let contacto = item.contacto;
      if (!contacto) {
        contacto = await tx.contacto.create({ data: { nombre: item.nombre, empresa: item.nombre, fuente: "manual" }, select: { id: true, nombre: true, empresa: true } });
        contactos.push(contacto);
      }
      let cliente = clientePorContacto.get(String(contacto.id));
      if (!cliente) {
        const creado = await tx.despachoCliente.create({ data: { contactoId: contacto.id, responsableId: item.responsable.id } });
        cliente = { id: creado.id, contactoId: creado.contactoId, responsableId: creado.responsableId, activo: creado.activo };
        clientePorContacto.set(String(contacto.id), cliente);
        creados += 1;
      } else if (String(cliente.responsableId ?? "") !== String(item.responsable.id) || !cliente.activo) {
        const reactivar = !cliente.activo;
        const actualizado = await tx.despachoCliente.update({ where: { id: cliente.id }, data: { responsableId: item.responsable.id, activo: true, version: { increment: 1 } } });
        cliente = { ...cliente, responsableId: actualizado.responsableId, activo: actualizado.activo };
        clientePorContacto.set(String(contacto.id), cliente);
        actualizados += 1;
        if (reactivar) reactivados += 1;
      }

      const procesosAsignados = await tx.despachoClienteProceso.findMany({ where: { clienteId: cliente.id }, select: { id: true, responsableId: true } });
      for (const proceso of procesosAsignados) {
        if (String(proceso.responsableId ?? "") !== String(item.responsable.id)) {
          await tx.despachoClienteProceso.update({ where: { id: proceso.id }, data: { responsableId: item.responsable.id } });
        }
      }
      const actividades = await tx.despachoActividad.findMany({ where: { clienteId: cliente.id }, select: { id: true, estado: true, responsableId: true } });
      for (const actividad of actividades) {
        await tx.despachoActividad.update({ where: { id: actividad.id }, data: { responsableId: item.responsable.id, version: { increment: 1 } } });
        await tx.despachoActividadCambio.create({
          data: {
            actividadId: actividad.id,
            estadoAnterior: actividad.estado,
            estadoNuevo: actividad.estado,
            userId: null,
            nota: `Seed cartera: responsable reasignado de ${usuarios.find((usuario) => usuario.id === actividad.responsableId)?.nombre ?? "Sin asignar"} a ${item.responsable.nombre}.`,
          },
        });
      }
    }

    let clienteDeTrabajoInterno = clienteInterno;
    if (!clienteDeTrabajoInterno) {
      let contacto = contactoInterno;
      if (!contacto) {
        contacto = await tx.contacto.create({ data: { nombre: "Despacho interno", empresa: "Despacho interno", fuente: "manual" }, select: { id: true, nombre: true, empresa: true } });
      }
      const creado = await tx.despachoCliente.create({ data: { contactoId: contacto.id, notas: "Cliente interno para actividades administrativas del despacho." } });
      clienteDeTrabajoInterno = { id: creado.id, contactoId: creado.contactoId, responsableId: creado.responsableId, activo: creado.activo };
      creados += 1;
    } else if (!clienteDeTrabajoInterno.activo) {
      const actualizado = await tx.despachoCliente.update({ where: { id: clienteDeTrabajoInterno.id }, data: { activo: true, version: { increment: 1 } } });
      clienteDeTrabajoInterno = { ...clienteDeTrabajoInterno, activo: actualizado.activo };
      reactivados += 1;
    }

    const fechaHoy = fechaMexico();
    const periodo = comoFecha(primerDiaMes(fechaHoy));
    for (const [etiqueta, titulo] of ACTIVIDADES_INTERNAS) {
      const clave = claveResponsable.get(normalizar(etiqueta));
      const responsable = responsables[clave];
      const existente = await tx.despachoActividad.findFirst({
        where: { clienteId: clienteDeTrabajoInterno.id, titulo, tipo: "extraordinaria", periodo },
      });
      if (!existente) {
        await tx.despachoActividad.create({
          data: {
            clienteId: clienteDeTrabajoInterno.id,
            tipo: "extraordinaria",
            titulo,
            periodo,
            fechaLimite: comoFecha(fechaHoy),
            responsableId: responsable.id,
            notas: "Actividad interna de la cartera cargada por seed idempotente.",
          },
        });
      } else if (String(existente.responsableId ?? "") !== String(responsable.id)) {
        await tx.despachoActividad.update({ where: { id: existente.id }, data: { responsableId: responsable.id, version: { increment: 1 } } });
      }
    }

    return { ...plan, dryRun: false, clientesCreados: creados, clientesReasignados: actualizados, clientesReactivados: reactivados, fechaActividadesInternas: fechaHoy, actividadesInternasSinDuplicar: true };
  }, { timeout: 120000 });

  console.log(JSON.stringify(resultado, null, 2));
  if (!aplicar) console.log("Para aplicar localmente: node scripts/seed-refmex-despacho-cartera.mjs --apply");
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
