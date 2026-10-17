import assert from "node:assert/strict";
import { createCipheriv, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const raiz = fileURLToPath(new URL("../../", import.meta.url));
const contenedor = "ambarcrm-premerge-20261017";
const base = `ensayo_meta_${Date.now()}`;

function ejecutar(programa, argumentos, entrada) {
  const resultado = spawnSync(programa, argumentos, {
    cwd: raiz, input: entrada, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  });
  if (resultado.error) throw resultado.error;
  if (resultado.status !== 0) throw new Error(resultado.stderr || resultado.stdout);
  return resultado.stdout;
}

const inspeccion = JSON.parse(ejecutar("docker", ["inspect", contenedor]))[0];
assert.deepEqual(inspeccion.NetworkSettings.Ports["5432/tcp"], [{ HostIp: "127.0.0.1", HostPort: "55450" }]);
assert.equal(inspeccion.Config.Image, "postgres:16");
const sql = (texto, bd = base) => ejecutar("docker", ["exec", "-i", contenedor, "psql", "-X", "-qAt", "-U", "dueno", "-d", bd, "-v", "ON_ERROR_STOP=1"], texto);
const json = (consulta) => JSON.parse(sql(consulta));
const referencia = "meta-tech-provider";
sql(`CREATE DATABASE ${base};`, "crm");
for (const archivo of ["schema.sql", "web/prisma/sql/multi-tenant.sql", "web/prisma/sql/actualizaciones.sql"]) {
  sql(ejecutar("git", ["show", `${referencia}:${archivo}`]));
}

const clave = Buffer.alloc(32);
function cifrar(token) {
  const iv = randomBytes(12);
  const cifrador = createCipheriv("aes-256-gcm", clave, iv);
  const datos = Buffer.concat([cifrador.update(token, "utf8"), cifrador.final()]);
  return ["encv1", iv.toString("base64url"), cifrador.getAuthTag().toString("base64url"), datos.toString("base64url")].join(":");
}
const literal = (valor) => `'${valor.replaceAll("'", "''")}'`;
let semilla = "BEGIN;\n";
for (const org of [100, 101]) {
  semilla += `INSERT INTO orgs(id,nombre,slug) VALUES (${org},'Empresa sintética ${org}','ensayo-${org}');\n`;
  semilla += `INSERT INTO etiquetas(org_id,nombre) VALUES (${org},'Migración');\n`;
  for (let modo = 0; modo < 3; modo++) {
    const phone = `${org}000000${modo}`;
    const config = { phoneNumberId: phone, wabaId: `waba-sintetico-${org}` };
    if (modo !== 1) config.token = `TOKEN-FALSO-${org}-${modo}`;
    if (modo !== 0) config.tokenEncrypted = cifrar(`TOKEN-FALSO-CIFRADO-${org}-${modo}`);
    semilla += `INSERT INTO canales_whatsapp(org_id,nombre,instancia,estado,config) VALUES (${org},'Canal ${org}-${modo}','${phone}','conectado',${literal(JSON.stringify(config))}::jsonb);\n`;
    semilla += `INSERT INTO bots(org_id,nombre,webhook_url,api_token,canal_id) SELECT ${org},'Bot ${modo}','https://example.invalid/no-ejecutar','api-sintetica-${org}-${modo}',id FROM canales_whatsapp WHERE instancia='${phone}';\n`;
    for (let numero = 0; numero < 10; numero++) {
      const telefono = `${phone}${String(numero).padStart(2, "0")}`;
      semilla += `INSERT INTO contactos(org_id,nombre,telefono,fuente) VALUES (${org},'Contacto ${telefono}','${telefono}','whatsapp');\n`;
      semilla += `INSERT INTO conversaciones(org_id,contacto_id,canal_id,etiquetas) SELECT ${org},c.id,k.id,ARRAY['Migración'] FROM contactos c CROSS JOIN canales_whatsapp k WHERE c.telefono='${telefono}' AND k.instancia='${phone}';\n`;
      semilla += `INSERT INTO mensajes(org_id,conversacion_id,direccion,contenido,wa_message_id,timestamp) SELECT ${org},v.id,CASE WHEN n%2=0 THEN 'entrante' ELSE 'saliente' END::direccion_msg,'Mensaje sintético '||n,'ensayo-${telefono}-'||n,TIMESTAMPTZ '2026-10-16 23:59:00-06' + n*INTERVAL '1 minute' FROM conversaciones v JOIN contactos c ON c.id=v.contacto_id CROSS JOIN generate_series(1,20) n WHERE c.telefono='${telefono}';\n`;
    }
  }
}
semilla += "INSERT INTO contacto_etiquetas(org_id,contacto_id,etiqueta_id) SELECT c.org_id,min(c.id),e.id FROM contactos c JOIN etiquetas e ON e.org_id=c.org_id AND e.nombre='Migración' GROUP BY c.org_id,e.id;\n";
sql(`${semilla}COMMIT;`);

const columnas = json(`SELECT jsonb_object_agg(table_name, columnas) FROM (SELECT table_name,jsonb_agg(column_name ORDER BY ordinal_position) columnas FROM information_schema.columns WHERE table_schema='public' GROUP BY table_name) t;`);
const identificador = (valor) => `"${valor.replaceAll('"', '""')}"`;
function huellas(esquema) {
  const consultas = Object.entries(esquema).map(([tabla, campos]) => {
    const proyeccion = campos.map(identificador).join(",");
    return `SELECT ${literal(tabla)} tabla, jsonb_build_object('filas',count(*),'md5',md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text,'[]'))) resumen FROM (SELECT ${proyeccion} FROM ${identificador(tabla)}) t`;
  });
  return json(`SELECT jsonb_object_agg(tabla,resumen) FROM (${consultas.join(" UNION ALL ")}) datos;`);
}
const antes = huellas(columnas);
const etiquetasPrevias = json("SELECT COALESCE(jsonb_agg(to_jsonb(t)),'[]') FROM contacto_etiquetas t;");
const actualizaciones = ejecutar("git", ["show", "modulos-fase-2:web/prisma/sql/actualizaciones.sql"]);
assert.equal(actualizaciones.replaceAll("\r\n", "\n"), readFileSync(path.join(raiz, "web/prisma/sql/actualizaciones.sql"), "utf8").replaceAll("\r\n", "\n"));
const corridas = [];
let posterior;
for (let numero = 1; numero <= 3; numero++) {
  const inicio = performance.now();
  sql(actualizaciones);
  const segundos = Number(((performance.now() - inicio) / 1000).toFixed(3));
  const despues = huellas(columnas);
  const etiquetasConservadas = sql(`SELECT ${literal(JSON.stringify(etiquetasPrevias))}::jsonb <@ (SELECT jsonb_agg(to_jsonb(t)) FROM contacto_etiquetas t);`).trim();
  assert.equal(etiquetasConservadas, "t", "El backfill debe conservar las etiquetas previas");
  const sinEtiquetas = (valores) => Object.fromEntries(Object.entries(valores).filter(([tabla]) => tabla !== "contacto_etiquetas"));
  assert.deepEqual(sinEtiquetas(despues), sinEtiquetas(antes), "Las columnas y filas previas deben permanecer intactas");
  const actuales = json(`SELECT jsonb_object_agg(table_name, columnas) FROM (SELECT table_name,jsonb_agg(column_name ORDER BY ordinal_position) columnas FROM information_schema.columns WHERE table_schema='public' GROUP BY table_name) t;`);
  const todas = huellas(actuales);
  if (posterior) assert.deepEqual(todas, posterior, "La segunda y tercera corrida no deben alterar datos");
  posterior = todas;
  corridas.push({ numero, segundos, columnasPreviasIntactas: true, datosIdempotentes: numero > 1 });
  console.log(`Corrida ${numero}: ${segundos}s; filas previas intactas`);
}
const verificaciones = json(`SELECT jsonb_build_object(
  'mensajesSinCanal',(SELECT count(*) FROM mensajes WHERE canal_id IS NULL),
  'conversacionesSinUltimoEntrante',(SELECT count(*) FROM conversaciones WHERE ultimo_entrante_at IS NULL),
  'botsConPermisosHeredados',(SELECT count(*) FROM bots WHERE permisos=ARRAY['leer_perfil','enviar_mensaje','notas_internas','mover_embudo','handoff']),
  'etiquetasMigradas',(SELECT count(*) FROM contacto_etiquetas),
  'tokensPlanos',(SELECT count(*) FROM canales_whatsapp WHERE COALESCE(config->>'token','')<>''),
  'tokensCifrados',(SELECT count(*) FROM canales_whatsapp WHERE COALESCE(config->>'tokenEncrypted','')<>''),
  'soloPlano',(SELECT count(*) FROM canales_whatsapp WHERE COALESCE(config->>'token','')<>'' AND COALESCE(config->>'tokenEncrypted','')=''),
  'tipoFechaMensaje',(SELECT data_type FROM information_schema.columns WHERE table_name='mensajes' AND column_name='timestamp')
);`);
assert.deepEqual(verificaciones, { mensajesSinCanal: 0, conversacionesSinUltimoEntrante: 0, botsConPermisosHeredados: 6, etiquetasMigradas: 60, tokensPlanos: 4, tokensCifrados: 4, soloPlano: 2, tipoFechaMensaje: "timestamp with time zone" });
const informe = { base, contenedor, referencia, commitOrigen: ejecutar("git", ["rev-parse", referencia]).trim(), commitDestino: ejecutar("git", ["rev-parse", "modulos-fase-2"]).trim(), corridas, verificaciones, antes, despues: huellas(columnas), despuesCompleto: posterior };
writeFileSync(path.join(raiz, "docs/ensayo-migracion-pre-merge-2026-10-17.json"), `${JSON.stringify(informe, null, 2)}\n`);
console.log(JSON.stringify({ base, corridas, verificaciones }, null, 2));
