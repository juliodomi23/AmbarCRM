import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import pg from "pg";

const { Pool } = pg;
const [adminEmail, adminPassword] = process.argv.slice(2);
if (!adminEmail || !adminPassword || !process.env.SOURCE_DATABASE_URL) {
  throw new Error(
    "Uso: SOURCE_DATABASE_URL=... node scripts/import-gestorlegal.mjs <correo-soporte> <contraseña>",
  );
}

const prisma = new PrismaClient();
const source = new Pool({ connectionString: process.env.SOURCE_DATABASE_URL });
const SISTEMA = "gestorlegal";
const ORG_SLUG = process.env.TARGET_ORG_SLUG || "despacho-legal";
const ORG_NAME = process.env.TARGET_ORG_NAME || "Despacho legal";
const SENSITIVE_KEYS = new Set([
  "password_hash",
  "pin",
  "pin_generado",
  "access_token",
  "secret",
  "token",
]);

function limpio(valor) {
  return valor == null || String(valor).trim() === "" ? null : String(valor).trim();
}

function fecha(valor) {
  if (!valor) return null;
  const resultado = new Date(valor);
  return Number.isNaN(resultado.getTime()) ? null : resultado;
}

function monto(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}

function telefono(valor) {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  return digitos ? digitos.slice(-10) : null;
}

function idFila(fila, indice) {
  return String(fila.id ?? fila.folio ?? fila.clave ?? indice);
}

function sanear(valor) {
  if (valor instanceof Date) return valor.toISOString();
  if (Array.isArray(valor)) return valor.map(sanear);
  if (!valor || typeof valor !== "object") return valor;
  return Object.fromEntries(
    Object.entries(valor)
      .filter(([clave]) => {
        const normalizada = clave.toLowerCase();
        return !SENSITIVE_KEYS.has(normalizada)
          && !/(password|passwd|contrase|(^|_)pin($|_)|token|secret|api.?key)/i.test(normalizada);
      })
      .map(([clave, contenido]) => [clave, sanear(contenido)]),
  );
}

async function leerTablas() {
  const nombres = await source.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
  );
  const tablas = new Map();
  for (const { tablename } of nombres.rows) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tablename)) continue;
    const resultado = await source.query(`SELECT * FROM "${tablename}"`);
    tablas.set(tablename, resultado.rows);
  }
  return tablas;
}

async function leerReasignaciones() {
  if (!process.env.REASSIGNMENT_CSV) return new Map();
  const contenido = await readFile(process.env.REASSIGNMENT_CSV, "utf8");
  const mapa = new Map();
  for (const linea of contenido.trim().split(/\r?\n/).slice(1)) {
    const [tabla, id] = linea.split(",").map((item) => item.trim());
    if (tabla && id) mapa.set(`${tabla}:${id}`, true);
  }
  return mapa;
}

async function logoDataUrl() {
  if (!process.env.LEGACY_LOGO_PATH) return null;
  const buffer = await readFile(process.env.LEGACY_LOGO_PATH);
  const tipo = extname(process.env.LEGACY_LOGO_PATH).toLowerCase() === ".png"
    ? "image/png"
    : "image/jpeg";
  return `data:${tipo};base64,${buffer.toString("base64")}`;
}

function estadoCita(valor) {
  return {
    agendada: "programada",
    programada: "programada",
    confirmada: "confirmada",
    completada: "completada",
    cancelada: "cancelada",
    no_show: "no_asistio",
  }[valor] || "programada";
}

function estadoOportunidad(valor) {
  if (valor === "converted") return "ganado";
  if (valor === "discarded") return "perdido";
  return "abierto";
}

const tablas = await leerTablas();
const reasignaciones = await leerReasignaciones();
const logo = await logoDataUrl();
const passwordHash = await bcrypt.hash(adminPassword, 10);
const org = await prisma.org.upsert({
  where: { slug: ORG_SLUG },
  update: { nombre: ORG_NAME, activo: true },
  create: { slug: ORG_SLUG, nombre: ORG_NAME },
});

await prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe("SELECT set_config('app.current_org', $1, true)", String(org.id));
  const admin = await tx.usuario.upsert({
    where: { orgId_email: { orgId: org.id, email: adminEmail.toLowerCase() } },
    update: { passwordHash, activo: true, rol: "admin", puesto: "Administrador" },
    create: {
      nombre: "Soporte Ámbar CRM",
      email: adminEmail.toLowerCase(),
      passwordHash,
      rol: "admin",
      puesto: "Administrador",
    },
  });
  await tx.ajustes.upsert({
    where: { orgId: org.id },
    update: { nombreNegocio: ORG_NAME, marcaNombre: ORG_NAME, marcaLogo: logo, marcaPreset: "profesional" },
    create: { nombreNegocio: ORG_NAME, marcaNombre: ORG_NAME, marcaLogo: logo, marcaPreset: "profesional" },
  });
  for (const clave of ["legal", "asesorias_legales", "finanzas_legales", "operacion_legal", "citas"]) {
    await tx.moduloOrg.upsert({
      where: { orgId_clave: { orgId: org.id, clave } },
      update: { activo: true },
      create: { clave, activo: true, config: {} },
    });
  }

  const refs = new Map(
    (await tx.referenciaExterna.findMany({ where: { sistema: SISTEMA } }))
      .map((ref) => [`${ref.entidad}:${ref.clave}`, ref.destinoId]),
  );
  async function guardarRef(entidad, clave, destinoId) {
    refs.set(`${entidad}:${clave}`, destinoId);
    await tx.referenciaExterna.upsert({
      where: { orgId_sistema_entidad_clave: { orgId: org.id, sistema: SISTEMA, entidad, clave: String(clave) } },
      update: { destinoId },
      create: { sistema: SISTEMA, entidad, clave: String(clave), destinoId },
    });
  }
  const ref = (entidad, clave) => refs.get(`${entidad}:${clave}`) ?? null;

  const usuarios = new Map();
  for (const fila of tablas.get("usuarios") ?? []) {
    const correo = limpio(fila.email)?.toLowerCase() || `legacy-${fila.id}@local.invalid`;
    const hash = limpio(fila.password_hash)?.startsWith("$2") ? fila.password_hash : passwordHash;
    const usuario = await tx.usuario.upsert({
      where: { orgId_email: { orgId: org.id, email: correo } },
      update: { nombre: fila.nombre || correo, activo: fila.activo !== false },
      create: {
        nombre: fila.nombre || correo,
        email: correo,
        passwordHash: hash,
        rol: fila.rol === "admin" ? "admin" : "agente",
        puesto: fila.rol === "asistente" ? "Asistente jurídico" : "Abogado",
        activo: fila.activo !== false,
      },
    });
    usuarios.set(String(fila.id), usuario.id);
    await guardarRef("usuario", fila.id, usuario.id);
  }
  const reasignarNombre = (process.env.REASSIGN_TO_NAME || "").toLowerCase();
  const destinoReasignacion = (tablas.get("usuarios") ?? []).find((fila) =>
    String(fila.nombre ?? "").toLowerCase().includes(reasignarNombre),
  );
  const destinoUsuarioId = destinoReasignacion
    ? usuarios.get(String(destinoReasignacion.id))
    : admin.id;

  const sucursales = new Map();
  for (const fila of tablas.get("sucursales") ?? []) {
    const sucursal = await tx.sucursalLegal.upsert({
      where: { orgId_legacyId: { orgId: org.id, legacyId: String(fila.id) } },
      update: { nombre: fila.nombre, direccion: limpio(fila.direccion), telefono: telefono(fila.telefono) },
      create: {
        legacyId: String(fila.id),
        nombre: fila.nombre || "Sucursal",
        direccion: limpio(fila.direccion),
        telefono: telefono(fila.telefono),
        metadata: sanear(fila),
      },
    });
    sucursales.set(String(fila.id), sucursal.id);
    await guardarRef("sucursal", fila.id, sucursal.id);
  }

  async function importarContacto(fila, entidad) {
    const clave = String(fila.id);
    const existenteId = ref(entidad, clave);
    const reasignado = reasignaciones.has(`${entidad === "cliente" ? "clientes" : "prospectos"}:${clave}`);
    const data = {
      nombre: limpio(fila.nombre) || "Sin nombre",
      telefono: telefono(fila.telefono),
      email: limpio(fila.email || fila.correo)?.toLowerCase(),
      fuente: "otro",
      notas: limpio(fila.notas || fila.nota),
      responsableId: reasignado ? destinoUsuarioId : usuarios.get(String(fila.abogado_id)) ?? null,
      campos: sanear({ tipo_cliente: fila.tipo, ciudad: fila.ciudad, asunto_legal: fila.asunto }),
    };
    let contacto;
    if (existenteId) contacto = await tx.contacto.update({ where: { id: existenteId }, data });
    else {
      const porTelefono = data.telefono
        ? await tx.contacto.findFirst({ where: { telefono: data.telefono } })
        : null;
      contacto = porTelefono
        ? await tx.contacto.update({ where: { id: porTelefono.id }, data: { ...data, telefono: undefined } })
        : await tx.contacto.create({ data });
      await guardarRef(entidad, clave, contacto.id);
    }
    return contacto;
  }
  const contactos = new Map();
  for (const fila of tablas.get("clientes") ?? []) {
    const contacto = await importarContacto(fila, "cliente");
    contactos.set(String(fila.id), contacto.id);
  }

  let embudo = await tx.embudo.findFirst({ where: { nombre: "Prospectos legales" } });
  if (!embudo) embudo = await tx.embudo.create({ data: { nombre: "Prospectos legales", orden: 20 } });
  const estadosProspecto = [...new Set((tablas.get("prospectos") ?? []).map((fila) => fila.estado || "sin_estado"))];
  const etapas = new Map();
  for (let indice = 0; indice < estadosProspecto.length; indice += 1) {
    const nombre = String(estadosProspecto[indice]).replaceAll("_", " ");
    let etapa = await tx.etapa.findFirst({ where: { embudoId: embudo.id, nombre } });
    if (!etapa) {
      const tipo = estadosProspecto[indice] === "converted"
        ? "ganado"
        : estadosProspecto[indice] === "discarded" ? "perdido" : "normal";
      etapa = await tx.etapa.create({ data: { embudoId: embudo.id, nombre, orden: indice + 1, tipo } });
    }
    etapas.set(estadosProspecto[indice], etapa.id);
  }
  for (const fila of tablas.get("prospectos") ?? []) {
    const contacto = await importarContacto(fila, "prospecto");
    const existenteId = ref("oportunidad_prospecto", fila.id);
    const data = {
      contactoId: contacto.id,
      embudoId: embudo.id,
      etapaId: etapas.get(fila.estado || "sin_estado"),
      titulo: limpio(fila.asunto) || `Prospecto legal ${fila.id}`,
      responsableId: usuarios.get(String(fila.abogado_id)) ?? null,
      estado: estadoOportunidad(fila.estado),
      motivoPerdida: fila.estado === "discarded" ? limpio(fila.nota) : null,
    };
    const oportunidad = existenteId
      ? await tx.oportunidad.update({ where: { id: existenteId }, data })
      : await tx.oportunidad.create({ data });
    if (!existenteId) await guardarRef("oportunidad_prospecto", fila.id, oportunidad.id);
  }

  const expedientes = new Map();
  for (const fila of tablas.get("expedientes") ?? []) {
    const reasignado = reasignaciones.has(`expedientes:${fila.id}`);
    const data = {
      numeroInterno: limpio(fila.numero_interno),
      numeroJudicial: limpio(fila.numero_judicial),
      contactoId: contactos.get(String(fila.cliente_id)) ?? ref("cliente", fila.cliente_id),
      responsableId: reasignado ? destinoUsuarioId : usuarios.get(String(fila.abogado_responsable_id)) ?? null,
      sucursalId: sucursales.get(String(fila.sucursal_id)) ?? null,
      rolCliente: limpio(fila.rol_cliente),
      materia: limpio(fila.materia),
      tipoJuicio: limpio(fila.tipo_juicio),
      juzgado: limpio(fila.juzgado),
      etapaProcesal: limpio(fila.etapa_procesal),
      estado: limpio(fila.estado) || "activo",
      cuantia: fila.cuantia == null ? null : monto(fila.cuantia),
      resumen: limpio(fila.resumen),
      fechaInicio: fecha(fila.fecha_inicio),
      metadata: sanear(fila),
    };
    const expediente = await tx.expedienteLegal.upsert({
      where: { orgId_legacyId: { orgId: org.id, legacyId: String(fila.id) } },
      update: data,
      create: { legacyId: String(fila.id), ...data },
    });
    expedientes.set(String(fila.id), expediente.id);
    await guardarRef("expediente", fila.id, expediente.id);
  }

  const registros = [
    ["actuaciones", "actuacion", "tipo", "descripcion", "fecha"],
    ["audiencias", "audiencia", "tipo", "lugar", "fecha_hora"],
    ["documentos", "documento", "nombre", "revision_notas", "creado_en"],
    ["terminos", "termino", "tipo", "descripcion", "vencimiento_termino"],
    ["partes", "parte", "rol", "nombre", null],
    ["seguimientos", "seguimiento", "tipo_caso", "notas", "ultimo_contacto"],
  ];
  for (const [tabla, tipo, tituloCampo, descripcionCampo, fechaCampo] of registros) {
    for (const fila of tablas.get(tabla) ?? []) {
      const expedienteId = expedientes.get(String(fila.expediente_id));
      if (!expedienteId) continue;
      const reasignado = reasignaciones.has(`${tabla}:${fila.id}`);
      const data = {
        expedienteId,
        usuarioId: reasignado
          ? destinoUsuarioId
          : usuarios.get(String(fila.registrado_por || fila.abogado_id || fila.subido_por)) ?? null,
        titulo: limpio(fila[tituloCampo]) || `${tipo} ${fila.id}`,
        descripcion: limpio(fila[descripcionCampo]),
        estado: limpio(fila.estado || fila.revision_estado),
        fechaInicio: fecha(fechaCampo ? fila[fechaCampo] : fila.creado_en),
        fechaFin: fecha(fila.prorroga_hasta),
        archivoUrl: tipo === "documento" ? limpio(fila.link_drive) : null,
        metadata: sanear(fila),
      };
      await tx.registroExpedienteLegal.upsert({
        where: { orgId_tipo_legacyId: { orgId: org.id, tipo, legacyId: String(fila.id) } },
        update: data,
        create: { legacyId: String(fila.id), tipo, ...data },
      });
    }
  }

  for (const fila of tablas.get("asesorias") ?? []) {
    let asesoriaContactoId = contactos.get(String(fila.cliente_id)) ?? null;
    if (!asesoriaContactoId && (fila.telefono || fila.nombre)) {
      asesoriaContactoId = ref("contacto_asesoria", fila.id);
      if (!asesoriaContactoId) {
        const numero = telefono(fila.telefono);
        const existente = numero ? await tx.contacto.findFirst({ where: { telefono: numero } }) : null;
        const contacto = existente ?? await tx.contacto.create({
          data: {
            nombre: limpio(fila.nombre) || `Persona de asesoría ${fila.id}`,
            telefono: numero,
            email: limpio(fila.correo)?.toLowerCase(),
            fuente: "otro",
          },
        });
        asesoriaContactoId = contacto.id;
        await guardarRef("contacto_asesoria", fila.id, contacto.id);
      }
    }
    const data = {
      contactoId: asesoriaContactoId,
      expedienteId: expedientes.get(String(fila.expediente_id)) ?? null,
      sucursalId: sucursales.get(String(fila.sucursal_id)) ?? null,
      abogadoId: usuarios.get(String(fila.abogado_id)) ?? null,
      fecha: fecha(fila.fecha),
      tema: limpio(fila.tema),
      resumen: limpio(fila.resumen),
      estado: limpio(fila.status) || "pendiente",
      monto: monto(fila.monto),
      seguimiento: limpio(fila.seguimiento),
      origen: limpio(fila.origen),
      metadata: sanear(fila),
    };
    await tx.asesoriaLegal.upsert({
      where: { orgId_legacyId: { orgId: org.id, legacyId: String(fila.id) } },
      update: data,
      create: { legacyId: String(fila.id), ...data },
    });
  }

  for (const fila of tablas.get("citas") ?? []) {
    let contactoId = contactos.get(String(fila.cliente_id)) ?? null;
    if (!contactoId) {
      contactoId = ref("contacto_cita", fila.id);
      if (!contactoId) {
        const numero = telefono(fila.telefono);
        const existente = numero ? await tx.contacto.findFirst({ where: { telefono: numero } }) : null;
        const contacto = existente ?? await tx.contacto.create({
          data: {
            nombre: limpio(fila.cliente_nombre) || `Persona de cita ${fila.id}`,
            telefono: numero,
            fuente: "otro",
          },
        });
        contactoId = contacto.id;
        await guardarRef("contacto_cita", fila.id, contacto.id);
      }
    }
    const inicio = fecha(fila.fecha_hora);
    if (!contactoId || !inicio) continue;
    const data = {
      contactoId,
      responsableId: usuarios.get(String(fila.abogado_id)) ?? null,
      inicio,
      fin: new Date(inicio.getTime() + 60 * 60 * 1000),
      titulo: limpio(fila.asunto) || "Cita legal",
      notas: limpio(fila.seguimiento_nota),
      estado: estadoCita(fila.estado),
    };
    const existenteId = ref("cita", fila.id);
    const cita = existenteId
      ? await tx.cita.update({ where: { id: existenteId }, data })
      : await tx.cita.create({ data });
    if (!existenteId) await guardarRef("cita", fila.id, cita.id);
  }

  const fuentesFinancieras = [
    ["planes_pago", "plan_pago", "notas", "monto_total", "fecha_prox_pago"],
    ["pagos", "pago", "concepto", "monto_total", "fecha_pago"],
    ["movimientos_caja", null, "concepto", "monto", "fecha"],
    ["diligencias", "diligencia", "folio", null, "fecha"],
    ["gastos_expediente", "gasto", "concepto", "monto", "fecha"],
  ];
  for (const [tabla, tipoFijo, conceptoCampo, montoCampo, fechaCampo] of fuentesFinancieras) {
    for (const fila of tablas.get(tabla) ?? []) {
      const tipo = tipoFijo || limpio(fila.tipo) || "movimiento_caja";
      const data = {
        expedienteId: expedientes.get(String(fila.expediente_id)) ?? null,
        contactoId: contactos.get(String(fila.cliente_id)) ?? null,
        sucursalId: sucursales.get(String(fila.sucursal_id)) ?? null,
        usuarioId: usuarios.get(String(fila.registrado_por || fila.abogado_id)) ?? null,
        concepto: limpio(fila[conceptoCampo]) || `${tipo.replaceAll("_", " ")} ${fila.id}`,
        monto: monto(montoCampo ? fila[montoCampo] : 0),
        estado: limpio(fila.estado || fila.estado_pago || fila.tipo),
        fecha: fecha(fila[fechaCampo]),
        metadata: sanear(fila),
      };
      await tx.movimientoLegal.upsert({
        where: { orgId_tipo_legacyId: { orgId: org.id, tipo, legacyId: String(fila.id) } },
        update: data,
        create: { legacyId: String(fila.id), tipo, ...data },
      });
    }
  }

  const fuentesOperacion = [
    "checadas",
    "actividades_plantilla",
    "actividades_registro",
    "actividades_respuestas",
    "auditoria",
    "envios_registro",
  ];
  for (const tabla of fuentesOperacion) {
    for (const fila of tablas.get(tabla) ?? []) {
      const tipo = tabla.replace(/s$/, "");
      const data = {
        usuarioId: usuarios.get(String(fila.usuario_id || fila.user_id)) ?? null,
        sucursalId: sucursales.get(String(fila.sucursal_id)) ?? null,
        fecha: fecha(fila.fecha || fila.creado_en || fila.actualizado_en),
        estado: limpio(fila.tipo || fila.estado || fila.respuesta),
        descripcion: limpio(fila.descripcion || fila.observaciones || fila.accion),
        metadata: sanear(fila),
      };
      await tx.registroOperacionLegal.upsert({
        where: { orgId_tipo_legacyId: { orgId: org.id, tipo, legacyId: idFila(fila, 0) } },
        update: data,
        create: { legacyId: idFila(fila, 0), tipo, ...data },
      });
    }
  }

  await tx.registroLegacyLegal.deleteMany({ where: { sistema: SISTEMA } });
  for (const [tabla, filas] of tablas) {
    for (let inicio = 0; inicio < filas.length; inicio += 500) {
      await tx.registroLegacyLegal.createMany({
        data: filas.slice(inicio, inicio + 500).map((fila, indice) => ({
          sistema: SISTEMA,
          tabla,
          legacyId: idFila(fila, inicio + indice),
          payload: sanear(fila),
        })),
        skipDuplicates: true,
      });
    }
  }
}, { timeout: 900_000, maxWait: 30_000 });

const resumen = await prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe("SELECT set_config('app.current_org', $1, true)", String(org.id));
  return {
    org: ORG_SLUG,
    usuarios: await tx.usuario.count(),
    contactos: await tx.contacto.count(),
    oportunidades: await tx.oportunidad.count(),
    citas: await tx.cita.count(),
    expedientes: await tx.expedienteLegal.count(),
    registrosExpediente: await tx.registroExpedienteLegal.count(),
    asesorias: await tx.asesoriaLegal.count(),
    movimientos: await tx.movimientoLegal.count(),
    operaciones: await tx.registroOperacionLegal.count(),
    archivoLegacy: await tx.registroLegacyLegal.count(),
  };
});
console.log(JSON.stringify(resumen, null, 2));
await source.end();
await prisma.$disconnect();
