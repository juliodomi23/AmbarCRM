import { createRequire } from "node:module";

createRequire(import.meta.url)("@next/env").loadEnvConfig(process.cwd());

const { db, dbRaw, runWithOrg } = await import("../src/lib/db");

const NOMBRE_ORG = "Serénica Health Center";
const SLUG_ORG = "serenica-health-center";
const NOMBRE_BOT = "Bot Serénica · Agenda dental";
const MODULOS = ["pacientes", "citas", "reservas_en_linea"];
const PERMISOS = ["leer_perfil", "enviar_mensaje", "notas_internas", "handoff", "gestionar_contactos", "crear_tarea", "agendar_cita"];
const ETIQUETAS = ["bot_off", "escalado_humano", "citado", "recordatorio_enviado", "cita_confirmada", "comprobante_transferencia"];

async function main() {
  const org = await dbRaw.org.findUnique({ where: { slug: SLUG_ORG }, select: { id: true, nombre: true } });
  if (!org || org.nombre !== NOMBRE_ORG) throw new Error("Falta la organización Serénica o su nombre no coincide");
  const orgId = org.id;
  const correos = ["SERENICA_ADMIN_EMAIL", "SERENICA_RECEPCION_EMAIL", "SERENICA_DOCTORA_EMAIL"]
    .map((variable) => process.env[variable]?.trim().toLowerCase());
  if (correos.some((correo) => !correo)) throw new Error("Define los tres correos SERENICA_*_EMAIL para verificar usuarios");

  const tablasRls = await dbRaw.$queryRaw<Array<{ tablename: string; habilitada: boolean; qual: string | null; with_check: string | null }>>`
    SELECT p.tablename, c.relrowsecurity AS habilitada, p.qual, p.with_check
    FROM pg_policies p JOIN pg_class c ON c.relname = p.tablename
    WHERE p.schemaname = 'public' AND p.tablename IN ('etiquetas', 'odontograma_zonas')
      AND c.relnamespace = 'public'::regnamespace
      AND p.policyname = 'org_isolation'
    GROUP BY p.tablename, c.relrowsecurity, p.qual, p.with_check`;
  const rolApp = await dbRaw.$queryRaw<Array<{ rolsuper: boolean; rolbypassrls: boolean }>>`
    SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
  if (!rolApp[0] || rolApp[0].rolsuper || rolApp[0].rolbypassrls) throw new Error("DATABASE_URL debe usar el rol de aplicación sin SUPERUSER ni BYPASSRLS");
  const politicaCorrecta = (tabla: string) => tablasRls.some((fila) =>
    fila.tablename === tabla && fila.habilitada &&
    fila.qual?.includes("current_setting('app.current_org'") &&
    fila.with_check?.includes("current_setting('app.current_org'")
  );
  if (!politicaCorrecta("etiquetas") || !politicaCorrecta("odontograma_zonas")) {
    throw new Error("Falta la política org_isolation de etiquetas u odontograma_zonas");
  }

  const otroOrg = await dbRaw.org.findFirst({ where: { id: { not: orgId } }, select: { id: true } });
  if (!otroOrg) throw new Error("Se requiere otra organización para comprobar el aislamiento RLS");

  const resultado = await runWithOrg(orgId, async () => {
    const [modulos, usuarios, doctores, etiquetas, bot] = await Promise.all([
      db.moduloOrg.findMany({ where: { orgId, clave: { in: MODULOS }, activo: true }, select: { clave: true } }),
      db.usuario.findMany({ where: { orgId, email: { in: correos as string[] }, activo: true }, select: { email: true } }),
      db.doctor.findMany({ where: { orgId, nombre: { in: ["Dr. Ricardo Azcorra", "Dra. Paloma"] }, activo: true }, select: { nombre: true } }),
      db.etiqueta.findMany({ where: { orgId, nombre: { in: ETIQUETAS } }, select: { nombre: true } }),
      db.bot.findFirst({ where: { orgId, nombre: NOMBRE_BOT, activo: true }, select: { permisos: true } }),
    ]);
    const visiblesDesdeOtraOrg = await runWithOrg(otroOrg.id, () => db.etiqueta.findMany({ where: { orgId }, select: { id: true }, take: 1 }));
    return { modulos, usuarios, doctores, etiquetas, bot, visiblesDesdeOtraOrg };
  });

  const faltanModulos = MODULOS.filter((clave) => !resultado.modulos.some((modulo) => modulo.clave === clave));
  const faltanUsuarios = correos.filter((correo) => !resultado.usuarios.some((usuario) => usuario.email === correo));
  const faltanDoctores = ["Dr. Ricardo Azcorra", "Dra. Paloma"].filter((nombre) => !resultado.doctores.some((doctor) => doctor.nombre === nombre));
  const faltanEtiquetas = ETIQUETAS.filter((nombre) => !resultado.etiquetas.some((etiqueta) => etiqueta.nombre === nombre));
  const faltanPermisos = PERMISOS.filter((permiso) => !resultado.bot?.permisos.includes(permiso));
  const errores = [
    ...faltanModulos.map((x) => `módulo inactivo o faltante: ${x}`),
    ...faltanUsuarios.map((x) => `usuario activo faltante: ${x}`),
    ...faltanDoctores.map((x) => `doctor activo faltante: ${x}`),
    ...faltanEtiquetas.map((x) => `etiqueta faltante: ${x}`),
    ...(!resultado.bot ? ["bot Serénica activo faltante"] : []),
    ...faltanPermisos.map((x) => `permiso faltante en bot: ${x}`),
    ...(resultado.visiblesDesdeOtraOrg.length ? ["RLS deja ver etiquetas de Serénica desde otra organización"] : []),
  ];
  if (errores.length) throw new Error(`Verificación Serénica falló:\n- ${errores.join("\n- ")}`);
  console.log(`verificar:serenica OK · ${org.nombre} · módulos, usuarios, doctores, etiquetas, bot y aislamiento RLS`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "No se pudo verificar Serénica");
  process.exitCode = 1;
}).finally(() => dbRaw.$disconnect());
