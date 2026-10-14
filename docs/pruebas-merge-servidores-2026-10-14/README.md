# Verificación del merge de servidores · 2026-10-14

## Fallo previsto, primero

Único fallo: **test-lealtad-aurum.ts**, por variables AURUM sin configurar.
Salida literal:

```text
FALLO: AssertionError [ERR_ASSERTION]: faltan variables de la prueba
EXIT 1
```

[Salida completa](test-lealtad-aurum.txt). Es la excepción autorizada por la solicitud:
32/32 checks y 36/37 tests pasaron. No hubo otro fallo ni cambios al código para
hacer pasar la batería. No se conectó un Aurum ni otro servicio de producción.

## Fast-forward y alcance

Antes: modulos-fase-2 y origin/modulos-fase-2 en
`adc08366952899bb00d1f81e94b78fef3e85569a`, con un único commit pendiente,
`56edbb972bf6bb29cd3ee7396b633925fe2dc146` de modulos-ar-servidores.
Git estaba limpio salvo cinco PROMPT-*.md locales sin seguimiento; quedaron fuera.

Se ejecutó `git checkout modulos-fase-2` y `git merge --ff-only modulos-ar-servidores`.
Resultado: fast-forward a **56edbb9**, sin conflictos ni commit de merge.
[Referencias e historial](merge.txt). La referencia remota se volvió a consultar
antes del push y seguía en adc0836. El siguiente commit solo contiene documentación
actualizada y evidencia nueva de esta verificación; no modifica web/ ni main.

El push autorizado de modulos-fase-2 se hace únicamente tras confirmar las puertas
siguientes. El redeploy y toda operación de producción quedan a cargo de Julio.

## Resultados literales

| Comprobación | Resultado | Salida |
|---|---|---|
| Prisma validate | EXIT 0 | [prisma-validate.txt](prisma-validate.txt) |
| tsc --noEmit | EXIT 0 | [tipos.txt](tipos.txt) |
| npm run lint | EXIT 0 | [lint.txt](lint.txt) |
| next build | EXIT 0 | [build.txt](build.txt) |
| Todos los check-*.ts | TOTAL 32; FALLOS 0 | [checks-resumen.txt](checks-resumen.txt) |
| Tests de BD | TOTAL 26; FALLOS 1 (solo Aurum) | [db-resumen.txt](db-resumen.txt) |
| Tests HTTP con next start | TOTAL 11; FALLOS 0 | [http-resumen.txt](http-resumen.txt) |
| Todos los test-*.ts | TOTAL 37; FALLOS 1 | [test-resumen.txt](test-resumen.txt) |
| Migración, primera pasada | EXIT 0 | [migracion-1.txt](migracion-1.txt) |
| Migración, segunda pasada consecutiva | EXIT 0 | [migracion-2.txt](migracion-2.txt) |
| Seed servidores, primera corrida | 4 nuevos; tokens omitidos; EXIT 0 | [seed-servidores-1.txt](seed-servidores-1.txt) |
| Seed servidores, segunda corrida | 0 nuevos; sin tokens; EXIT 0 | [seed-servidores-2.txt](seed-servidores-2.txt) |
| Snapshot completo tras repetir seed | Idéntico; 0 heartbeats; EXIT 0 | [seed-servidores-resumen.txt](seed-servidores-resumen.txt) |

Cada check y test tiene su salida literal individual en esta carpeta. Las salidas
conservan incluso mensajes de errores esperados por las aserciones de casos negativos;
el EXIT final de cada archivo determina su resultado. Solo se ocultaron los cuatro
tokens nuevos del seed antes de persistir su stdout, no después de guardarlo.
No se almacenaron tokens en claro ni se incluyen en el commit.

## Entorno desechable y fixture

Contenedor nuevo `ambarcrm-merge-servidores-20261014`, imagen postgres:16,
PostgreSQL **16.14**, puerto solo local **127.0.0.1:55453**, base crm en tmpfs:
[identidad](contenedor.txt), [versión y rol](postgres-rol.txt).
`crm_app` tiene rolsuper=false y rolbypassrls=false. Ninguna BD de producción se
consultó o modificó. Docker Desktop estaba apagado y se inició para estas pruebas;
el puerto 55453 estaba libre, no fue necesario detener otro contenedor.

Inicialización de cero: [schema.sql](init-schema.txt),
[multi-tenant.sql](init-multitenant.txt), luego las dos pasadas seguidas de
actualizaciones.sql. Todas terminaron sin errores. La aplicación probada fue el
build de la rama ya fusionada, servido con next start en 127.0.0.1:3128, con sesión,
WA_API_KEY y valores de Meta ficticios locales; AURUM permaneció vacío.

Julio confirmó que la org real es **id=1 / inicial**. El código de multi-tenant
inicializa inicial y el admin usa org 1; el seed AR tiene un default distinto
(ambar-rojo), por lo que no se tomó ese default como prueba del slug de producción.
El fixture comercial se creó **en la BD local** con ORG_SLUG=inicial antes de
probar el seed de servidores. Ambas corridas de servidores también usaron
ORG_SLUG=inicial y NODE_ENV sin definir.

Los E2E existentes de AR exigen literalmente la org de pruebas `ambar-rojo` y el
puerto 55453; para ejecutar los scripts sin editarlos se cambió temporalmente el
slug de id=1 solo en el contenedor desechable. [Salida](fixture-slug-e2e.txt).
Al terminar se restauró a inicial. [Estado final](estado-final-bd.txt): cuatro
servidores y cero heartbeats de prueba en esa organización. Esta adaptación de
fixture no es un cambio ni una consulta de datos de producción.

## Preparación de producción

La sección **Servidores** de
[DESPLIEGUE-MODULOS-AR.md](../DESPLIEGUE-MODULOS-AR.md) documenta el orden:
respaldo externo → redeploy y logs de db-migrate/app → seed → guardar tokens →
instalar heartbeat por VPS → comprobar semáforo → configurar n8n.

El seed real preparado es:

```sh
cd /app
(
  unset NODE_ENV
  ORG_SLUG=inicial ALLOW_DEMO_SEED=1 node scripts/seed-servidores.mjs
)
```

No se ejecutó en producción. La guarda sigue rechazando NODE_ENV=production,
incluso con autorización. El subshell quita NODE_ENV solo para esa ejecución,
sin alterar el proceso Next. Los tokens deben guardarse en el gestor de contraseñas,
no en logs. Los datos inciertos (fechas, costos y cargas) y el curl por cada IP,
el cron de retención y la importación inactiva de n8n están en la guía.

Quedan para Julio: respaldo, redeploy, confirmar SQL/Prisma/RLS, seed, tokens en
31.220.49.58 / 31.220.51.95 / 77.37.67.251 / 187.77.20.78, comprobar /servidores
y /panel-ar y configurar n8n. No se desplegó, importó/ejecutó n8n, envió WhatsApp,
tocó el chat de Villafuerte o conectó producción. Teléfono real, cron real de los
VPS, lector de pantalla y operación en producción no se verificaron.

Scripts para reproducir: ejecutar-pruebas.ps1 -Tipo checks/db/http;
iniciar-app-local.ps1 sirve el build; probar-seed.mjs exige localhost:55453/crm y
org inicial/id=1, y omite los tokens antes de guardar las salidas. Para repetir la
primera corrida del seed, recrear el contenedor desechable con las inicializaciones
anteriores; los servidores existentes se conservan por diseño.
