import { PrismaClient } from "@prisma/client";
import { credencialesDemo } from "./lib/demo-seed.mjs";
import { nuevoTokenHeartbeat } from "./lib/heartbeat-token.mjs";

credencialesDemo("sin-usuario@local.test");
const slug = process.env.ORG_SLUG;
if (!slug) throw new Error("Define ORG_SLUG; no se elige una organización por defecto");
const prisma = new PrismaClient();
const fuente = "⚠️ Confirmar vence, costo anual y cargas contra la BD real del panel original. Fuente: docs/11-infraestructura/infraestructura-n8n.md y docs/05-financiero/infraestructura-hosting.md; documentación histórica, no producción.";
const servidores = [
  { nombre: "VPS Ámbar Rojo", ip: "31.220.49.58", propietario: "AR", loPagamos: true, vence: new Date("2027-05-11T00:00:00Z"), clientes: ["Coparmex", "Serénica Health Center", "Futura Fortuna"], cargasLibres: "DeclaraBot\nApp 300 Lugares\nPanel Gestión", notas: "KVM 2. ⚠️ Fecha 2027-05-11 documentada; confirmar. Futura Fortuna en baja." },
  { nombre: "VPS Villafuerte", ip: "31.220.51.95", propietario: "Cliente (Lic. Villafuerte)", loPagamos: false, clientes: ["Villafuerte y Asociados", "Dentu"], cargasLibres: "", notas: "⚠️ Fecha de renovación por confirmar con el cliente." },
  { nombre: "VPS Pruebas", ip: "77.37.67.251", propietario: "AR / compartido", loPagamos: true, clientes: [], cargasLibres: "Entorno dev (no productivo)", notas: "⚠️ Confirmar reparto del costo con los otros propietarios." },
  { nombre: "VPS Pie Feliz", ip: "187.77.20.78", propietario: "AR", loPagamos: true, clientes: [], cargasLibres: "Pie Feliz (heredado)\nambarcrm_demo\nnovegabienesraices.com ⚠️", notas: "⚠️ Vence marzo 2027; falta el día exacto, no se inventa fecha. Confirmar ambarcrm_demo y novegabienesraices.com." },
];
try {
  const org = await prisma.org.findUniqueOrThrow({ where: { slug } });
  if (org.id !== 1n) throw new Error("Servidores solo se siembra en la organización plataforma (id=1)");
  const tokens = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT set_config('app.current_org', ${String(org.id)}, true)`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${org.id})`;
    await tx.moduloOrg.upsert({ where: { orgId_clave: { orgId: org.id, clave: "servidores" } }, create: { clave: "servidores", activo: true }, update: {} });
    const creados = [];
    for (const s of servidores) {
      if (await tx.servidor.findFirst({ where: { nombre: s.nombre } })) { console.log(`${s.nombre}: ya existe, se conserva sin cambios.`); continue; }
      const { clientes, notas, ...datos } = s;
      const { token, hash } = nuevoTokenHeartbeat();
      const contratos = clientes.length ? await tx.contrato.findMany({ where: { servidorId: null, contacto: { nombre: { in: clientes } } }, include: { contacto: { select: { nombre: true } } } }) : [];
      const sinContrato = clientes.filter(nombre => !contratos.some(c => c.contacto.nombre === nombre));
      const servidor = await tx.servidor.create({ data: { ...datos, cargasLibres: [datos.cargasLibres, ...sinContrato.map(n => `${n} ⚠️ sin contrato en CRM`)].filter(Boolean).join("\n"), proveedor: "Hostinger", costoAnualMxn: null, ramTotalMb: null, heartbeatTokenHash: hash, notas: `${notas}\n${fuente}` } });
      if (contratos.length) await tx.contrato.updateMany({ where: { id: { in: contratos.map(c => c.id) }, servidorId: null }, data: { servidorId: servidor.id } });
      creados.push({ nombre: s.nombre, token });
    }
    return creados;
  }, { timeout: 30000 });
  // Solo imprimir tras confirmar la transacción; jamás persistir el token en archivos.
  for (const { nombre, token } of tokens) console.log(`${nombre} · TOKEN (única vez): ${token}`);
  console.log(`Seed ${slug}: ${tokens.length} servidores nuevos; sin heartbeats ni porcentajes inventados. ${fuente}`);
} finally { await prisma.$disconnect(); }
