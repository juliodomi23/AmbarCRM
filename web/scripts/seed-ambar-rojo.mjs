import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { credencialesDemo } from "./lib/demo-seed.mjs";

const slugOrg = process.env.ORG_SLUG ?? "ambar-rojo";
const credenciales = credencialesDemo(process.env.ADMIN_EMAIL ?? "admin@ambar-rojo.local.test");
const prisma = new PrismaClient();
let usuarioCreado = false;
const fuente = "Prompt modulos-ar (13-oct-2026); docs/03-clientes/index.md, docs/05-financiero e índice/resumen de junio desactualizados.";

// Las cifras actuales del usuario prevalecen sobre los documentos históricos.
const clientes = [
  { nombre: "Villafuerte y Asociados", contratos: [
    { tipo: "bot_whatsapp", estado: "produccion", montoCierre: "6500", mensualidad: "1200", diaCobro: 5, pagado: true, notas: "Asistente a clientes. Cierre pagado; fecha y método históricos por confirmar." },
    { tipo: "otro", estado: "produccion", montoCierre: null, mensualidad: "800", diaCobro: 5, notas: "Bot interno / GestorLegal. Cierre del segundo servicio por confirmar; no crear saldo supuesto." },
  ] },
  { nombre: "Dentu", duda: "⚠️ Confirmar producción (se registra provisionalmente según la instrucción actual), cierre pagado/sin saldo y monto de cierre. No importar una cotización como deuda.", contratos: [
    { tipo: "bot_whatsapp", estado: "produccion", montoCierre: null, mensualidad: "1200", diaCobro: 5 },
  ] },
  { nombre: "Serénica Health Center", contratos: [
    { tipo: "bot_whatsapp", estado: "produccion", montoCierre: "4500", mensualidad: "1200", diaCobro: 5, pagado: true, notas: "Solo asistente externo; bot Facebook excluido. Cierre pagado según usuario; fecha/método por confirmar." },
  ] },
  { nombre: "Alwater", duda: "⚠️ Confirmar estado, día de cobro e inicio de mensualidad. Acta de cierre aún tenía saldo vacío; el usuario confirma $12,000 pagados completos. Hasta confirmar estado, no entra al MRR actual.", contratos: [
    { tipo: "agente_odoo", estado: null, montoCierre: "12000", mensualidad: "1500", diaCobro: null, pagado: true },
  ] },
  { nombre: "Exi Chiapas", duda: "⚠️ Anticipo recibido, importe/porcentaje por confirmar (no asumir $6,000). Balance pendiente sin monto ni fecha; mensualidad por definir. Fuente: prospectos/Exi Chiapas - prospecto/cotizacion-exi-chiapas.md.", ganado: "12000", contratos: [
    { tipo: "bot_whatsapp", estado: "en_desarrollo", montoCierre: "12000", anticipoPct: null, mensualidad: null, diaCobro: null },
  ] },
  { nombre: "SEMBID (Edwin Monge)", duda: "⚠️ Confirmar estado, mensualidad (usuario menciona $1,200 sin certeza), día e inicio de cobro. Cierre $0 por trueque según usuario; cotizacion-sembid.md antigua decía $10,500 y $1,500/mes: no usarla como deuda.", ganado: "0", contratos: [
    { tipo: "bot_whatsapp", estado: null, montoCierre: "0", mensualidad: null, diaCobro: null, notas: "Trueque / acuerdo especial, agenda + BILLDU; no es un cierre normal." },
  ] },
  { nombre: "Futura Fortuna", duda: "⚠️ Confirmar fecha de baja y montos históricos ya pagados. Sin pendientes.", contratos: [
    { tipo: "bot_whatsapp", estado: "baja", montoCierre: null, mensualidad: null, diaCobro: null, notas: "Valeria WA + bot FB; pagado según usuario, sin saldo." },
  ] },
  { nombre: "Pie Feliz", contratos: [
    { tipo: "bot_whatsapp", estado: "baja", montoCierre: "7000", mensualidad: "1200", diaCobro: null, fechaBaja: "2026-07-08", pagado: true },
    { tipo: "web", estado: "baja", montoCierre: "2000", mensualidad: null, diaCobro: null, fechaBaja: "2026-07-08", pagado: true },
  ] },
  { nombre: "Huipix", contratos: [
    { tipo: "bot_whatsapp", estado: "incobrable", montoCierre: "4000", mensualidad: null, diaCobro: null, fechaBaja: "2026-06-22", incobrable: true, notas: "Relación terminada; cierre nunca cobrado." },
  ] },
];

const prospectos = [
  ["Colegio de Arquitectos Chiapanecos", "15000", "Cotizado", "⚠️ cotizacion-colegio-arquitectos-chiapanecos.html: completa $15,000; alternativa fase 1 $10,000. Confirmar alcance elegido y envío."],
  ["Energía Cero", "0", "Prospecto", "cotizacion-checklist.md: $8,500 es presupuesto base estimado, no cotización final; definir monto."],
  ["Rubí Perfumería", "0", "Prospecto", "cotizacion-checklist.md: rango estimado $10,000–$11,500, no monto final; definir monto."],
  ["Leyva Asesores — Panel 25 puntos", "0", "Prospecto", "Propuesta con paquetes alternativos y vigencia 31-ago-2026; confirmar paquete y monto vigente."],
  ["CrmLite/remarketing WhatsApp", "0", "Prospecto", "No se encontró cotización final; definir monto."],
  ["Tour por México", "0", "Prospecto", "La propuesta HTML es una maqueta de tours, sus precios no son el servicio de AR; definir monto."],
  ["Porfirio Consultor", "0", "Prospecto", "Automatización de faltantes en entrega; no se encontró carpeta/cotización; definir monto."],
  ["VendoApp", "0", "Prospecto", "Colaboración; propuesta Modo Restaurante v1 sin monto comercial final; definir monto."],
];

try {
  const org = await prisma.org.upsert({ where: { slug: slugOrg }, update: {}, create: { nombre: "Ámbar Rojo Studios", slug: slugOrg } });
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_org', ${String(org.id)}, true)`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${org.id})`;
    usuarioCreado = !(await tx.usuario.findUnique({ where: { orgId_email: { orgId: org.id, email: credenciales.email } } }));
    const usuario = await tx.usuario.upsert({ where: { orgId_email: { orgId: org.id, email: credenciales.email } }, update: {}, create: { nombre: "Administración Ámbar Rojo", email: credenciales.email, passwordHash: await bcrypt.hash(credenciales.password, 10), rol: "admin", puesto: "Administrador" } });
    await tx.ajustes.upsert({ where: { orgId: org.id }, update: {}, create: { marcaNombre: "Ámbar Rojo Studios", nombreNegocio: "Ámbar Rojo Studios" } });
    for (const clave of ["contratos", "cobros", "panel_ar", "cotizaciones"]) {
      const config = clave === "cotizaciones" ? {} : { puestosPermitidos: ["Administrador"], ...(clave === "cobros" ? { recordatoriosAutomaticos: false } : {}) };
      await tx.moduloOrg.upsert({ where: { orgId_clave: { orgId: org.id, clave } }, update: {}, create: { clave, activo: true, config } });
    }
    // Tareas es una pantalla base del CRM, no una clave del catálogo de módulos.
    const embudo = await tx.embudo.findFirst({ where: { nombre: "Comercial Ámbar Rojo" } }) ?? await tx.embudo.create({ data: { nombre: "Comercial Ámbar Rojo" } });
    const etapas = new Map();
    for (const [orden, nombre] of ["Prospecto", "Contactado", "Cotizado", "Negociación", "Ganado", "Perdido"].entries()) {
      const etapa = await tx.etapa.findFirst({ where: { embudoId: embudo.id, nombre } }) ?? await tx.etapa.create({ data: { embudoId: embudo.id, nombre, orden, tipo: nombre === "Ganado" ? "ganado" : nombre === "Perdido" ? "perdido" : "normal" } });
      etapas.set(nombre, etapa);
    }
    async function contacto(nombre, notas) {
      return await tx.contacto.findFirst({ where: { nombre } }) ?? await tx.contacto.create({ data: { nombre, telefono: null, email: null, optOutDifusion: true, notas: `${fuente}\n${notas ?? ""}\nTeléfono y correo sin importar; no usar datos personales reales.` } });
    }
    async function oportunidad(cliente, valor, etapa, titulo) {
      return await tx.oportunidad.findFirst({ where: { contactoId: cliente.id, embudoId: embudo.id, titulo } }) ?? await tx.oportunidad.create({ data: { contactoId: cliente.id, embudoId: embudo.id, etapaId: etapas.get(etapa).id, titulo, valor, estado: etapa === "Ganado" ? "ganado" : "abierto", responsableId: usuario.id } });
    }
    for (const cliente of clientes) {
      const persona = await contacto(cliente.nombre, cliente.duda);
      const origen = cliente.ganado !== undefined ? await oportunidad(persona, cliente.ganado, "Ganado", `Servicio contratado · ${cliente.nombre}`) : null;
      for (const servicio of cliente.contratos) {
        const { pagado, incobrable, ...datos } = servicio;
        const existe = await tx.contrato.findFirst({ where: { contactoId: persona.id, tipo: datos.tipo } });
        if (existe) continue; // No sobrescribir ediciones posteriores del equipo.
        const contrato = await tx.contrato.create({ data: { ...datos, contactoId: persona.id, oportunidadId: origen?.id ?? null, fechaBaja: datos.fechaBaja ? new Date(`${datos.fechaBaja}T00:00:00Z`) : null, notas: [datos.notas, cliente.duda, fuente].filter(Boolean).join("\n") } });
        if ((pagado || incobrable) && contrato.montoCierre?.gt(0)) {
          await tx.cobro.create({ data: { contratoId: contrato.id, concepto: "balance", monto: contrato.montoCierre, estado: incobrable ? "incobrable" : "pagado", nota: incobrable ? "Cierre incobrable, confirmado en fuente." : "Cierre completo pagado según usuario. Fecha y método históricos no disponibles; no cuenta como ingreso del mes." } });
        }
      }
    }
    const aliado = await contacto("Coparmex", "Alianza sin cobro ni contrato.");
    const etiqueta = await tx.etiqueta.upsert({ where: { orgId_nombre: { orgId: org.id, nombre: "aliado" } }, update: {}, create: { nombre: "aliado" } });
    if (!(await tx.contactoEtiqueta.findFirst({ where: { contactoId: aliado.id, etiquetaId: etiqueta.id } }))) await tx.contactoEtiqueta.create({ data: { contactoId: aliado.id, etiquetaId: etiqueta.id } });
    for (const [nombre, valor, etapa, nota] of prospectos) {
      const persona = await contacto(nombre, nota);
      const op = await oportunidad(persona, valor, etapa, `Propuesta · ${nombre}`);
      if (valor === "0" && !(await tx.tarea.findFirst({ where: { oportunidadId: op.id, titulo: "definir monto" } }))) {
        await tx.tarea.create({ data: { oportunidadId: op.id, titulo: "definir monto", descripcion: `Para CEO: ${nota}`, responsableId: null } });
      }
    }
    const contratos = await tx.contrato.findMany({ where: { estado: "produccion" } });
    const mrr = contratos.reduce((total, contrato) => total.plus(contrato.mensualidad ?? 0), new Prisma.Decimal(0));
    console.log(`Seed AR: ${await tx.contacto.count()} contactos; ${await tx.contrato.count()} contratos; ${await tx.cobro.count()} cobros; MRR $${mrr.toFixed(2)}; sin envíos.`);
  }, { timeout: 30000 });
  console.log(`Acceso local: /login?org=${slugOrg} (la contraseña de un usuario existente no se modifica).`);
  if (credenciales.passwordGenerada && usuarioCreado) console.log(`Contraseña generada para usuario nuevo: ${credenciales.password}`);
} finally { await prisma.$disconnect(); }
