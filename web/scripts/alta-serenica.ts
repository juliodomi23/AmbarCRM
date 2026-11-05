import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import bcrypt from "bcryptjs";
import type { RolUsuario } from "@prisma/client";

createRequire(import.meta.url)("@next/env").loadEnvConfig(process.cwd());

const { dbRaw } = await import("../src/lib/db");
const { transaccionTenant } = await import("../src/lib/retail-db");
const { generarToken, nuevoSecretoFirma } = await import("../src/lib/services/bots");
const { validarWebhookUrl } = await import("../src/lib/webhook-url");

const NOMBRE_ORG = "Serénica Health Center";
const SLUG_ORG = "serenica-health-center";
const NOMBRE_BOT = "Bot Serénica · Agenda dental";
const PERMISOS_BOT = ["leer_perfil", "enviar_mensaje", "notas_internas", "handoff", "gestionar_contactos", "crear_tarea", "agendar_cita"];
const ETIQUETAS = ["bot_off", "escalado_humano", "citado", "recordatorio_enviado", "cita_confirmada", "comprobante_transferencia"];
const MODULOS = ["pacientes", "citas", "reservas_en_linea"];
const argumentos = new Set(process.argv.slice(2));
const dryRun = argumentos.has("--dry-run");
const confirmoProduccion = argumentos.has("--confirmo-produccion");

for (const argumento of argumentos) {
  if (argumento !== "--dry-run" && argumento !== "--confirmo-produccion") throw new Error(`Argumento no reconocido: ${argumento}`);
}

function direccionBase() {
  const valor = process.env.DATABASE_URL;
  if (!valor) throw new Error("Falta DATABASE_URL");
  const url = new URL(valor);
  const nombre = decodeURIComponent(url.pathname.slice(1)).split("/")[0];
  if (!nombre) throw new Error("DATABASE_URL debe incluir el nombre de la base");
  if (nombre.toLowerCase().includes("prod") && !confirmoProduccion) {
    throw new Error("La base parece producción; agrega --confirmo-produccion solo cuando Julio autorice el alta");
  }
  return nombre;
}

function precioEnv(nombre: string) {
  const valor = process.env[nombre]?.trim();
  if (!valor) return 0; // precio 0 = "Precio a consultar" en la reserva pública
  const precio = Number(valor);
  if (!Number.isFinite(precio) || precio < 0 || Math.round(precio * 100) !== precio * 100) {
    throw new Error(`${nombre} debe ser un importe no negativo con hasta dos decimales`);
  }
  return precio;
}

function validarConfiguracionReal() {
  const emails = ["SERENICA_ADMIN_EMAIL", "SERENICA_RECEPCION_EMAIL", "SERENICA_DOCTORA_EMAIL"];
  for (const variable of emails) {
    const correo = process.env[variable]?.trim();
    if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new Error(`${variable} debe contener el correo confirmado por Julio`);
  }
  const correos = emails.map((variable) => process.env[variable]!.trim().toLowerCase());
  if (new Set(correos).size !== correos.length) throw new Error("Cada usuario Serénica debe tener un correo distinto");
  const webhook = process.env.SERENICA_N8N_WEBHOOK_URL?.trim();
  if (!webhook || !webhook.startsWith("https://") || validarWebhookUrl(webhook)) {
    throw new Error("SERENICA_N8N_WEBHOOK_URL debe ser una URL HTTPS pública y accesible desde AmbarCRM");
  }
  const key = Buffer.from(process.env.META_TOKEN_ENCRYPTION_KEY?.trim() ?? "", "base64");
  if (key.length !== 32) throw new Error("META_TOKEN_ENCRYPTION_KEY debe estar configurada como Base64 de 32 bytes");
  return {
    precios: {
      Limpieza: precioEnv("SERENICA_PRECIO_LIMPIEZA"),
      Ortodoncia: precioEnv("SERENICA_PRECIO_ORTODONCIA"),
      Implantes: precioEnv("SERENICA_PRECIO_IMPLANTES"),
      Extracciones: precioEnv("SERENICA_PRECIO_EXTRACCIONES"),
    },
  };
}

async function ejecutarAlta() {
  const org = await dbRaw.org.upsert({
    where: { slug: SLUG_ORG },
    create: { nombre: NOMBRE_ORG, slug: SLUG_ORG },
    update: { nombre: NOMBRE_ORG, activo: true },
    select: { id: true },
  });
  const precios = validarConfiguracionReal().precios;

  return transaccionTenant(org.id, async (tx) => {
    const configPacientes = { puestosPermitidos: ["Administrador", "Doctor", "Coordinador clínico"] };
    for (const clave of MODULOS) {
      await tx.moduloOrg.upsert({
        where: { orgId_clave: { orgId: org.id, clave } },
        create: { orgId: org.id, clave, activo: true, config: clave === "pacientes" ? configPacientes : {} },
        update: { activo: true, ...(clave === "pacientes" ? { config: configPacientes } : {}) },
      });
    }

    const doctorBase = await tx.doctor.upsert({
      where: { orgId_nombre: { orgId: org.id, nombre: "Dr. Ricardo Azcorra" } },
      create: { orgId: org.id, nombre: "Dr. Ricardo Azcorra", especialidad: "Odontología general" },
      update: { especialidad: "Odontología general", activo: true },
      select: { id: true },
    });
    const doctoraOrto = await tx.doctor.upsert({
      where: { orgId_nombre: { orgId: org.id, nombre: "Dra. Paloma" } },
      create: { orgId: org.id, nombre: "Dra. Paloma", especialidad: "Ortodoncia" },
      update: { especialidad: "Ortodoncia", activo: true },
      select: { id: true },
    });

    const horarios = [
      ...[1, 2, 3, 4, 5].flatMap((diaSemana) => [
        { doctorId: doctorBase.id, diaSemana, inicioMin: 600, finMin: 1080 },
        { doctorId: doctoraOrto.id, diaSemana, inicioMin: 660, finMin: 1080 },
      ]),
      { doctorId: doctorBase.id, diaSemana: 6, inicioMin: 600, finMin: 780 },
      { doctorId: doctoraOrto.id, diaSemana: 6, inicioMin: 660, finMin: 780 },
    ];
    for (const horario of horarios) {
      const existente = await tx.horarioDoctor.findFirst({ where: horario, select: { id: true } });
      if (!existente) await tx.horarioDoctor.create({ data: horario });
    }

    const servicios = [
      { nombre: "Valoración inicial", precio: 700, doctorIds: [doctorBase.id] },
      { nombre: "Limpieza", precio: precios.Limpieza, doctorIds: [doctorBase.id] },
      { nombre: "Ortodoncia", precio: precios.Ortodoncia, doctorIds: [doctoraOrto.id] },
      { nombre: "Implantes", precio: precios.Implantes, doctorIds: [doctorBase.id] },
      { nombre: "Extracciones", precio: precios.Extracciones, doctorIds: [doctorBase.id] },
    ];
    for (const servicio of servicios) {
      const guardado = await tx.servicioReserva.upsert({
        where: { orgId_nombre: { orgId: org.id, nombre: servicio.nombre } },
        create: { orgId: org.id, nombre: servicio.nombre, duracionMin: 60, precio: servicio.precio, activo: true },
        update: { duracionMin: 60, precio: servicio.precio, activo: true },
        select: { id: true },
      });
      await tx.servicioReservaDoctor.createMany({
        data: servicio.doctorIds.map((doctorId) => ({ orgId: org.id, servicioId: guardado.id, doctorId })),
        skipDuplicates: true,
      });
    }

    const correos = [
      { variable: "SERENICA_ADMIN_EMAIL", nombre: "Dr. Ricardo Azcorra", rol: "admin" as RolUsuario, puesto: "Administrador", agendaDoctorId: null as bigint | null, agendaSoloPropia: false },
      { variable: "SERENICA_RECEPCION_EMAIL", nombre: "Recepción Serénica", rol: "agente" as RolUsuario, puesto: "Recepcionista", agendaDoctorId: null as bigint | null, agendaSoloPropia: false },
      { variable: "SERENICA_DOCTORA_EMAIL", nombre: "Dra. Paloma", rol: "agente" as RolUsuario, puesto: "Doctor", agendaDoctorId: doctoraOrto.id, agendaSoloPropia: true },
    ];
    const credencialesNuevas: Array<{ nombre: string; email: string; password: string }> = [];
    for (const usuario of correos) {
      const email = process.env[usuario.variable]!.trim().toLowerCase();
      const existente = await tx.usuario.findFirst({ where: { orgId: org.id, email: { equals: email, mode: "insensitive" } }, select: { id: true } });
      const password = existente ? undefined : randomBytes(18).toString("base64url");
      const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;
      const datos = {
        email,
        nombre: usuario.nombre,
        rol: usuario.rol,
        puesto: usuario.puesto,
        agendaDoctorId: usuario.agendaDoctorId,
        agendaSoloPropia: usuario.agendaSoloPropia,
      };
      if (existente) {
        await tx.usuario.update({ where: { id: existente.id }, data: { ...datos, activo: true } });
      } else {
        await tx.usuario.create({
          data: {
            orgId: org.id,
            ...datos,
            passwordHash: passwordHash!,
          },
        });
      }
      if (password) credencialesNuevas.push({ nombre: usuario.nombre, email, password });
    }

    await tx.ajustes.upsert({
      where: { orgId: org.id },
      create: { orgId: org.id, nombreNegocio: NOMBRE_ORG, marcaNombre: NOMBRE_ORG, marcaPreset: "salud", marcaColorPrimario: "#0891B2", marcaColorAcento: "#10B981" },
      update: { nombreNegocio: NOMBRE_ORG, marcaNombre: NOMBRE_ORG, marcaPreset: "salud", marcaColorPrimario: "#0891B2", marcaColorAcento: "#10B981" },
    });

    let embudo = await tx.embudo.findFirst({ where: { orgId: org.id, nombre: "Seguimiento dental Serénica" }, select: { id: true } });
    if (!embudo) embudo = await tx.embudo.create({ data: { orgId: org.id, nombre: "Seguimiento dental Serénica", descripcion: "Seguimiento de pacientes y citas" }, select: { id: true } });
    for (const [orden, nombre] of ["Nuevo", "Contactado", "Cita agendada", "En tratamiento", "Seguimiento", "Finalizado"].entries()) {
      const etapa = await tx.etapa.findFirst({ where: { orgId: org.id, embudoId: embudo.id, nombre }, select: { id: true } });
      if (!etapa) await tx.etapa.create({ data: { orgId: org.id, embudoId: embudo.id, nombre, orden } });
    }

    for (const nombre of ETIQUETAS) {
      await tx.etiqueta.upsert({
        where: { orgId_nombre: { orgId: org.id, nombre } },
        create: { orgId: org.id, nombre },
        update: {},
      });
    }

    const webhookUrl = process.env.SERENICA_N8N_WEBHOOK_URL!.trim();
    const existenteBot = await tx.bot.findFirst({ where: { orgId: org.id, nombre: NOMBRE_BOT }, select: { id: true } });
    let botId: bigint;
    let secretoNuevo: { apiToken: string; signingSecret: string } | null = null;
    if (existenteBot) {
      await tx.bot.update({ where: { id: existenteBot.id }, data: { webhookUrl, permisos: PERMISOS_BOT, activo: true } });
      botId = existenteBot.id;
    } else {
      const firma = nuevoSecretoFirma();
      const apiToken = generarToken();
      const bot = await tx.bot.create({
        data: { orgId: org.id, nombre: NOMBRE_BOT, webhookUrl, apiToken, signingSecret: firma.cifrado, canalId: null, activo: true, permisos: PERMISOS_BOT },
        select: { id: true },
      });
      botId = bot.id;
      secretoNuevo = { apiToken, signingSecret: firma.plano };
    }
    return { credencialesNuevas, botId, secretoNuevo };
  });
}

async function main() {
  const base = direccionBase();
  if (dryRun) {
    const obligatorias = [
      "SERENICA_ADMIN_EMAIL", "SERENICA_RECEPCION_EMAIL", "SERENICA_DOCTORA_EMAIL",
      "SERENICA_N8N_WEBHOOK_URL", "META_TOKEN_ENCRYPTION_KEY",
    ];
    console.log(JSON.stringify({
      modo: "dry-run",
      base,
      alta: NOMBRE_ORG,
      modulos: MODULOS,
      usuarios: ["Dr. Ricardo Azcorra", "Recepción Serénica", "Dra. Paloma"],
      doctores: ["Dr. Ricardo Azcorra (L–V 10:00–18:00; sáb. 10:00–13:00)", "Dra. Paloma (L–V 11:00–18:00; sáb. 11:00–13:00)"],
      servicios: ["Valoración inicial ($700, 60 min)", "Limpieza", "Ortodoncia", "Implantes", "Extracciones"],
      etiquetas: ETIQUETAS,
      permisosBot: PERMISOS_BOT,
      variablesPendientes: obligatorias.filter((variable) => !process.env[variable]?.trim()),
      escritura: false,
    }, null, 2));
    return;
  }

  validarConfiguracionReal();
  const resultado = await ejecutarAlta();
  console.log(JSON.stringify({
    organizacion: NOMBRE_ORG,
    botId: resultado.botId.toString(),
    credencialesNuevas: resultado.credencialesNuevas,
    botSecretsNuevos: resultado.secretoNuevo,
    nota: "Guarda estas credenciales fuera del repositorio; solo se imprimen en esta ejecución y no se recuperan al repetir el alta.",
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "No se pudo completar el alta Serénica");
  process.exitCode = 1;
}).finally(() => dbRaw.$disconnect());
