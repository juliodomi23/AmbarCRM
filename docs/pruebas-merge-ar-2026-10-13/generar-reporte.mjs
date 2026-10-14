import assert from 'node:assert/strict';
import { readdir, readFile, writeFile } from 'node:fs/promises';
const leer = nombre => readFile(new URL(nombre,import.meta.url),'utf8');
async function resultados(carpeta,prefijo) {
  const nombres=(await readdir(new URL(carpeta,import.meta.url))).filter(n=>n.startsWith(prefijo)&&n.endsWith('.ts')).sort();
  return Promise.all(nombres.map(async nombre=>{
    const archivo=nombre.replace(/\.ts$/,'.txt');
    const salida=await leer(archivo);
    const codigo=salida.match(/^EXIT (\d+)\s*$/m);
    assert.ok(codigo,`Falta resultado final: ${archivo}`);
    return {nombre,archivo,salida,codigo:Number(codigo[1])};
  }));
}
const checks=await resultados('../../web/scripts/','check-');
const tests=await resultados('../../web/prisma/scripts/','test-');
assert.equal(checks.length,31);
assert.equal(tests.length,36);
const fallos=tests.filter(t=>t.codigo!==0);
const tabla=filas=>filas.map(t=>`| [${t.nombre}](${t.archivo}) | \`EXIT ${t.codigo}\` |`).join('\n');
const merge=await leer('merge.txt');
const sha=merge.split(/\r?\n/)[0];
const contenido=`# Verificación del merge de módulos AR · 2026-10-13

${fallos.length ? '**Fallos de la batería completa:**\n\n'+fallos.map(t=>`- [${t.nombre}](${t.archivo}): \`EXIT ${t.codigo}\`. ${t.salida.match(/FALLO: [^\r\n]+/)?.[0] ?? 'Consultar salida literal.'}`).join('\n') : '**La batería completa pasó.**'}

La prueba de lealtad necesita un **Aurum real de pruebas**, con negocio,
clienta y credenciales de prueba. No estaban configuradas sus cuatro variables
([presencia en el entorno](aurum-entorno.txt)); se mantuvieron vacías para
evitar conexiones a un servicio externo no identificado como prueba. No se
usaron credenciales de producción ni se sustituyó ese servicio por un mock.
El flujo real de lealtad queda sin verificar. El test no se modificó.

Se ejecutaron los 36 archivos \`prisma/scripts/test-*.ts\`: **${tests.filter(t=>t.codigo===0).length} pasaron; ${fallos.length} con fallo**.
Los checks terminaron con \`TOTAL 31; FALLOS ${checks.filter(t=>t.codigo!==0).length}\`.

## Merge local

Commit de merge: \`${sha}\`. Sin conflictos, estrategia \`ort\`.
La rama activa es \`modulos-fase-2\`. Local y referencia remota inicial:
\`9f147e1\` y \`a0b5fe4\`; los seis commits de AR partían de la base local.
El único trabajo posterior al merge es documentación y evidencia de pruebas.
Los prompts locales siguen sin seguimiento y no se añadieron.

[Estado inicial literal](estado-inicial.txt) · [hash y git log --oneline -9 al hacer el merge](merge.txt).

\`git log --oneline -9\` al terminar el merge:

\`\`\`text
${merge.split(/\r?\n/).slice(1).filter(Boolean).join('\n')}
\`\`\`

## Comprobaciones

| Comprobación | Resultado literal / evidencia |
|---|---|
| Prisma | [\`EXIT 0\`, esquema válido](prisma.txt) |
| TypeScript | [\`EXIT 0\`](tipos.txt) |
| Lint | [\`EXIT 0\`](lint.txt) |
| Next build | [\`EXIT 0\`](build.txt) |
| Todos los checks | [\`TOTAL 31; FALLOS 0\`](checks-resumen.txt) |
| Tests sin servidor Next | [\`TOTAL 26; FALLOS 1\`](db-resumen.txt) |
| Tests HTTP | [${(await leer('http-resumen.txt')).trim().split(/\r?\n/).at(-1)}](http-resumen.txt) |
| Migración, primera aplicación | [\`EXIT 0\`](migracion-1.txt) |
| Migración, segunda aplicación seguida | [\`EXIT 0\`](migracion-2.txt) |
| Config restringida antes | [Citas: Administrador / Recepcionista](control-antes.txt) |
| Config tras primera y segunda migración | [\`OK: config restringida intacta\`](control-despues-1.txt), [segunda](control-despues-2.txt) |
| Rol crm_app y políticas AR | [\`rolsuper=f\`, \`rolbypassrls=f\`, DEFAULT y org_isolation](rls-y-control.txt) |
| Seed, primera y segunda ejecución | [\`EXIT 0\`, 18 contactos / 11 contratos / 6 cobros / MRR $4400.00](seed-1.txt), [segunda](seed-2.txt) |
| Seed: idempotencia y otras orgs | [\`EXIT 0\`, conteos de 78 tablas iguales y SHA-256 ajenos intactos](seed-verificacion.txt) |
| NODE_ENV=production + ALLOW_DEMO_SEED=1 | [\`EXIT 1 (bloqueo esperado)\`](seed-production-allow.txt) |
| NODE_ENV=production sin ALLOW_DEMO_SEED | [\`EXIT 1 (bloqueo esperado)\`](seed-production-sin-allow.txt) |
| Entorno de prueba sin ALLOW_DEMO_SEED | [\`EXIT 1 (bloqueo esperado)\`](seed-test-sin-allow.txt) |

Los tres intentos bloqueados no modificaron datos. En las ejecuciones
autorizadas se usó \`NODE_ENV=test\` y \`ALLOW_DEMO_SEED=1\`.
[Snapshots](seed-snapshots.txt): [antes](snapshot-antes.json), [primero](snapshot-seed-1.json),
[segundo](snapshot-seed-2.json), [tras bloqueos](snapshot-guardas.json).
Cada snapshot compara todas las filas de las otras orgs, no solo sus conteos.

### Los 36 tests, uno por archivo

| Script | Resultado literal |
|---|---|
${tabla([...fallos,...tests.filter(t=>t.codigo===0)])}

### Los 31 checks, uno por archivo

| Script | Resultado literal |
|---|---|
${tabla(checks)}

## Entorno y preparación

PostgreSQL 16.14 en un contenedor nuevo \`ambarcrm-merge-ar-20261013\`,
publicado solo en \`127.0.0.1:55453\`. [Identidad y puertos](contenedor.txt).
Se detuvo únicamente el contenedor desechable anterior \`ambarcrm-ar-prueba\`
para liberar ese puerto, que está exigido por la guardia del E2E de AR.
No se utilizó \`ambarcrm-db\` ni ninguna BD de producción.

Inicialización: [schema.sql](init-schema.txt), [multi-tenant.sql](init-multitenant.txt)
y [actualizaciones.sql de a0b5fe4](init-base-fase-2.txt), antes de crear el control.
Después se aplicó el SQL de la rama fusionada dos veces seguidas.

La preparación inicial del control tuvo un error de quoting de PowerShell:
[\`unterminated quoted string\`, \`EXIT 1\`](control-intento-inicial.txt).
Se pasó el mismo SQL por stdin y se completó correctamente, sin editar SQL
de aplicación. La comparación antes/después pasó las dos veces.

El arranque desde herramientas fue rechazado por la revisión automática:
[\`blocked by policy\`](arranque-herramientas.txt). Julio inició el script
local en 3128; \`/api/auth/csrf\` respondió \`HTTP 200\` y se ejecutó la batería HTTP.
Los errores 42501 del [test-bot-api](test-bot-api.txt) son rechazos RLS/permisos
comprobados por el test, que terminó con \`EXIT 0\`; se conserva su salida íntegra.
\`git diff --check\` señaló espacios finales y líneas vacías de psql, Prisma
y Next en los logs literales. Esos archivos se conservaron sin recortar la salida;
la documentación y los scripts de reproducción se revisaron excluyendo los logs.

## Qué queda sin verificar

- Flujo real de lealtad contra Aurum, por ausencia de su servicio y credenciales de pruebas.
- Teléfono real, entrega/recepción real de WhatsApp y lector de pantalla.
- Producción: respaldo, redeploy, migración, seed y humo de Villafuerte y AR.
  Esas operaciones se documentaron, no se ejecutaron. Tampoco se hizo push.
- El entorno de la consola de EasyPanel: si exporta \`NODE_ENV=production\`,
  el seed está bloqueado incluso con \`ALLOW_DEMO_SEED=1\`. Compose y Dockerfile
  no fijan esa variable; se debe comprobar la consola antes del paso manual.

[Checklist de despliegue y respaldo](../DESPLIEGUE-MODULOS-AR.md).
No se cambiaron reglas de negocio, los tests ni código de la app para ocultar fallos.
La lista de datos AR pendientes de confirmar continúa en
[la entrega original](../entrega-modulos-ar-2026-10-13.md).
`;
await writeFile(new URL('README.md',import.meta.url),contenido);
console.log(`Reporte: ${checks.length} checks, ${tests.length} tests, fallos=${fallos.length}; merge ${sha}`);
