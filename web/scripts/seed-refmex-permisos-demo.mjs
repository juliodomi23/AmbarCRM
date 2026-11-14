// Uso: node scripts/seed-refmex-permisos-demo.mjs
// Idempotente. Ajusta permisos demo pedidos por REFMEX:
// - Cartagena con vista limitada de Despacho (solo avance de su equipo, sin detalle ajeno).
// - Tifany como revisora de contenido de las piezas de Lusmi.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SLUG = process.env.ORG_SLUG || "refmex";

const org = await prisma.org.findUnique({ where: { slug: SLUG } });
if (!org) throw new Error(`No existe la organización ${SLUG}`);

const configObjeto = (config) => (config && typeof config === "object" && !Array.isArray(config) ? { ...config } : {});
const lista = (valor) => (Array.isArray(valor) ? valor.map(String) : []);

await prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe("SELECT set_config('app.current_org', $1, true)", String(org.id));

  const usuarios = await tx.usuario.findMany({
    where: { orgId: org.id, email: { in: ["tifani@refmex.demo", "lusmi@refmex.demo", "cartagena@refmex.demo"] } },
    select: { id: true, email: true, nombre: true, puesto: true },
  });
  const porCorreo = new Map(usuarios.map((usuario) => [usuario.email, usuario]));
  const tifany = porCorreo.get("tifani@refmex.demo");
  const lusmi = porCorreo.get("lusmi@refmex.demo");
  const cartagena = porCorreo.get("cartagena@refmex.demo");
  if (!tifany || !lusmi || !cartagena) {
    throw new Error("Faltan usuarios demo. Corre primero seed-demo-despacho.mjs y seed-demo-contenido.mjs");
  }

  await tx.usuario.update({ where: { id: tifany.id }, data: { puesto: "Revisor de contenido", activo: true } });

  const moduloDespacho = await tx.moduloOrg.findFirst({ where: { clave: "despacho", activo: true } });
  if (moduloDespacho) {
    const config = configObjeto(moduloDespacho.config);
    const limitados = new Set([...lista(config.usuariosVistaLimitada), String(cartagena.id)]);
    const accesoTotal = new Set([...lista(config.usuariosAccesoTotal), String(lusmi.id)]);
    const confirmadores = new Set([...lista(config.usuariosConfirmadores), String(lusmi.id)]);
    await tx.moduloOrg.update({
      where: { id: moduloDespacho.id },
      data: {
        config: {
          ...config,
          usuariosVistaLimitada: [...limitados],
          usuariosAccesoTotal: [...accesoTotal],
          usuariosConfirmadores: [...confirmadores],
        },
      },
    });
  }

  const moduloContenido = await tx.moduloOrg.findFirst({ where: { clave: "contenido" } });
  const configContenido = moduloContenido ? configObjeto(moduloContenido.config) : {};
  const puestos = new Set([...lista(configContenido.puestosPermitidos), "Administrador", "Mercadotecnia", "Dirección comercial", "Revisor de contenido"]);
  const mapaRevisores = {
    ...(configContenido.revisoresPorRedactor && typeof configContenido.revisoresPorRedactor === "object" ? configContenido.revisoresPorRedactor : {}),
    [String(lusmi.id)]: String(tifany.id),
  };
  await tx.moduloOrg.upsert({
    where: { orgId_clave: { orgId: org.id, clave: "contenido" } },
    update: { activo: true, config: { ...configContenido, puestosPermitidos: [...puestos], revisoresPorRedactor: mapaRevisores } },
    create: { clave: "contenido", activo: true, config: { puestosPermitidos: [...puestos], revisoresPorRedactor: mapaRevisores } },
  });

  const reasignadas = await tx.contenidoPieza.updateMany({
    where: { redactorId: lusmi.id },
    data: { revisorId: tifany.id },
  });

  console.log(`Tifany (${tifany.id}) = revisora de contenido de Lusmi (${lusmi.id}). Piezas reasignadas: ${reasignadas.count}`);
  console.log(`Cartagena (${cartagena.id}) agregado a usuariosVistaLimitada de Despacho.`);
});

await prisma.$disconnect();
