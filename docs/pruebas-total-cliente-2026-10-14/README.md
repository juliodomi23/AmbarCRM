# Total cobrado con el cliente · 2026-10-14

## Fallos, primero

La batería conserva el fallo permitido de `test-lealtad-aurum.ts`:

```text
FALLO: AssertionError [ERR_ASSERTION]: faltan variables de la prueba
EXIT 1
```

[Salida literal completa](test-lealtad-aurum.txt). Las variables AURUM se dejaron
vacías; no se conectaron servicios externos.

El primer intento de UI detectó un error real de renderizado, ya corregido:

```text
Error: Attempted to call formatoMoneda() from the server but formatoMoneda is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.
```

La espera de la región terminó con `locator.waitFor: Timeout 30000ms exceeded.`
y `EXIT 1`. Se conservó la [salida original del test](test-total-cliente-ui-inicial-fallo.txt).
El renombrado del log de servidor falló con `The process cannot access the file because it is being used by another process.`;
la siguiente ejecución sobrescribió ese archivo. La
[transcripción del log de servidor](app-local-inicial-fallo-transcripcion.txt)
reproduce literalmente su lectura en la herramienta antes de detenerlo, y la
[transcripción del error de renombrado](renombrado-log-fallo-transcripcion.txt)
conserva la incidencia. Estas dos transcripciones no son los archivos originales
de redirección. Se extrajo el
formateador de `ui.tsx` a un módulo compartido; `ui.tsx` mantiene su exportación
para todos los consumidores existentes. Se repitieron tipos, lint, build y UI.
Los [tipos](tipos-inicial.txt), [lint](lint-inicial.txt) y
[build](build-inicial.txt) del intento anterior también se conservan.

## Rama y cambio

Rama `total-cobrado-cliente`, creada desde `modulos-fase-2`, con `241421f`
incluido: [base y comprobación literal](base.txt). Un único commit, sin merge,
push ni deploy. Los `PROMPT-*.md` sin seguimiento del usuario quedan fuera.

La ficha muestra antes de «Cobros del contrato»:

- Total recibido en todos los contratos del contacto, incluidos contratos de baja.
- Subtotal del contrato abierto, solamente si el contacto tiene varios contratos.
- Saldo pendiente/vencido: suma de monto menos suma de monto_pagado.
- Fecha del primer pago o abono válido, omitida cuando no hay fechas.
- Número de cobros de mensualidad en estado pagado.

`cobradoRegistrado(tx, where)` centraliza la regla usada por `/cobros` y la ficha:
sum(monto_pagado) excluyendo cancelado e incobrable, más sum(monto) de pagados
con pagos JSON `[]`. Un abono parcial aporta únicamente monto_pagado. Se mantiene
la fórmula histórica solicitada, sin alterar ni migrar datos históricos.
El KPI de `/cobros` conserva su alcance global de todos los periodos; la función
compartida acepta un filtro de cliente/contrato para el resumen.

Las sumas, recuentos y fechas se obtienen en BD, dentro de `transaccionTenant`.
El primer pago usa MIN sobre pagado_en y los timestamps de abonos JSON: no se
confunde la fecha del último abono con la antigüedad del cliente. No se suma ni
descarga una lista de cobros para calcular el resumen. El único cálculo monetario
fuera del agregado es sumar/restar resultados con `Prisma.Decimal`.

El formateador existente conserva cero decimales por omisión; la ficha pide dos
decimales y añade MXN. No se añadieron dependencias. Las tarjetas reutilizan
`surface`, `tnum` y los estilos de los KPI de cobros/panel-ar.

## Pruebas y capturas

Todas las órdenes se ejecutaron desde `web/`. Los wrappers PowerShell hacen
`Push-Location` antes de ejecutarlas. Los archivos `.txt` guardan las salidas
literales y el código de salida, sin sustituir errores por resultados esperados.

| Comprobación | Resultado final | Salida |
|---|---|---|
| npx tsc --noEmit | EXIT 0 | [tipos.txt](tipos.txt) |
| npm run lint | EXIT 0 | [lint.txt](lint.txt) |
| npx next build | EXIT 0 | [build.txt](build.txt) |
| Todos scripts/check-*.ts | 32/32, cero fallos | [checks-resumen.txt](checks-resumen.txt) y salida individual |
| Todos prisma/scripts/test-*.ts sin HTTP | 26/27; único fallo Aurum | [db-resumen.txt](db-resumen.txt) y salida individual |
| Todos prisma/scripts/test-*.ts HTTP | 12/12, cero fallos | [http-resumen.txt](http-resumen.txt) y salida individual |
| Nuevo test de agregados | EXIT 0, incluido en los 27 | [test-total-cobrado-cliente.txt](test-total-cobrado-cliente.txt) |
| UI real y paridad con KPI renderizado | EXIT 0, cuatro capturas | [test-total-cliente-ui.txt](test-total-cliente-ui.txt), [mediciones](visual.json) |

En total, los 39 scripts de Prisma se ejecutaron: 38 correctos y la única
excepción autorizada de Aurum. [Comprobación del inventario](verificacion-evidencia.txt).

El nuevo test de BD cubre dos contratos, cancelado/incobrable con abonos que no
aportan, pendiente sin pago, histórico sin abonos, parcial exacto, paridad KPI,
saldo, mensualidades, fecha del primer abono y fecha histórica, más de
`LIMITE_PANEL`, cliente sin pagos, histórico sin fecha y aislamiento RLS.
Se ejecuta como crm_app y comprueba rolsuper=false y rolbypassrls=false.

El [test de UI](test-total-cliente-ui.mjs) usa Playwright del runtime de Codex y
Edge, sin instalar paquetes. Crea una organización aislada y entra mediante
NextAuth. Compara el KPI real de `/cobros` ($1750.35) con las dos fichas
($1,750.35 MXN), con subtotales de $1,200.10 y $550.25, saldo $449.95, dos
mensualidades y fecha 1 mar 2026. El cliente sin pagos tiene un solo contrato:
$0.00 MXN y «Sin pagos registrados», sin subtotal repetido ni fecha inventada.

| Cliente | 375 px | 1440 px |
|---|---|---|
| Varios contratos | [Móvil](varios-contratos-375.png) | [Escritorio](varios-contratos-1440.png) |
| Sin pagos | [Móvil](sin-pagos-375.png) | [Escritorio](sin-pagos-1440.png) |

Las mediciones comprueban una columna a 375 y una fila a 1440, ancho documental
igual al viewport y ausencia de desbordes dentro de cada tarjeta. Las capturas
se inspeccionaron visualmente. En móvil se usa altura 2000 para incluir todas
las tarjetas y la lista de cobros del contenedor desplazable de la app; en
escritorio se usa altura 1000. Se conservan también las primeras capturas móviles
de altura 1000, que solo mostraban la parte superior del resumen.

## Entorno y reproducción

BD nueva en el contenedor `ambarcrm-total-cliente-20261014`, postgres:16,
tmpfs y puerto 127.0.0.1:55453. [Identidad](contenedor.txt),
[rol y versión](postgres-rol.txt). crm_app no tiene superusuario ni BYPASSRLS.
Se inicializa con `schema.sql`, `multi-tenant.sql` y `actualizaciones.sql`
existentes, sin editar esos archivos. El [fixture mínimo](fixture-local.mjs)
reproduce lo que exigen los E2E existentes: MRR 4400, balance histórico sin fecha,
embudo y usuario ficticio. No ejecuta seeds.

El contenedor de pruebas anterior que ocupaba 55453 se pausa temporalmente y se
restaura al finalizar; su identidad está en [contenedor-anterior.txt](contenedor-anterior.txt).
La app usa exclusivamente 127.0.0.1:3128 y las variables locales ficticias de
[entorno-local.ps1](entorno-local.ps1). La batería HTTP reinicia solo esa app
entre grupos de cuatro scripts para no agotar el limitador de logins existente;
no se modificó el limitador.

No quedó ninguna organización del nuevo fixture. RLS sigue activo en contratos
y cobros, cuyo dueño es diferente de crm_app: [estado final](estado-final-bd.txt).
La app local terminó, el contenedor nuevo fue eliminado y el anterior fue
restaurado: [limpieza](limpieza.txt). [Alcance intacto](alcance-intacto.txt)
comprueba contra `241421f` que esquema, archivos SQL, dependencias, API, acceso
tenant y panel-ar no cambiaron.

```powershell
docker run -d --name ambarcrm-total-cliente-20261014 -e POSTGRES_USER=dueno -e POSTGRES_PASSWORD=dueno_test -e POSTGRES_DB=crm -p 127.0.0.1:55453:5432 --tmpfs /var/lib/postgresql/data postgres:16
pwsh -File docs/pruebas-total-cliente-2026-10-14/preparar-bd.ps1
pwsh -File docs/pruebas-total-cliente-2026-10-14/estaticos.ps1
pwsh -File docs/pruebas-total-cliente-2026-10-14/ejecutar-pruebas.ps1 -Tipo checks
pwsh -File docs/pruebas-total-cliente-2026-10-14/ejecutar-pruebas.ps1 -Tipo db
pwsh -File docs/pruebas-total-cliente-2026-10-14/ejecutar-http.ps1
# En otra terminal, para la UI:
pwsh -File docs/pruebas-total-cliente-2026-10-14/iniciar-app-local.ps1
. ./docs/pruebas-total-cliente-2026-10-14/entorno-local.ps1
$env:PLAYWRIGHT_MODULE='file:///C:/Users/julio/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
cd web
node ../docs/pruebas-total-cliente-2026-10-14/test-total-cliente-ui.mjs
```

## Lo que no se tocó

- BD de producción, datos reales, VPS o servicios externos.
- Rama base, remotos, merge, push o deploy.
- Esquema Prisma, SQL del proyecto, migraciones, políticas RLS y permisos.
- API, registro de pagos, cancelación/eliminación, cron, MRR y cálculos de panel-ar.
- Seeds, servidores, autenticación, middleware y limitadores.
- Dependencias, package.json, lockfiles y .env.
- Tests/checks existentes y los PROMPT-*.md del usuario.
