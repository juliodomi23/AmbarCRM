# Cobros: cancelar pagos y eliminar cancelados · 2026-10-14

## Fallos y desviaciones, primero

Único fallo en los **resultados finales**: `test-lealtad-aurum.ts` (excepción
autorizada). Las variables AURUM se dejaron vacías para no conectar servicios
externos. Salida literal:

```text
FALLO: AssertionError [ERR_ASSERTION]: faltan variables de la prueba
EXIT 1
```

[Salida completa de Aurum](test-lealtad-aurum.txt).

También se conservan los intentos fallidos de preparación y verificación, sin
ocultarlos ni modificar código ajeno para hacer pasar la batería:

| Intento | Fallo literal / evidencia | Corrección |
|---|---|---|
| Fixture inicial | `Unique constraint failed on the (not available)`, `P2002`, EXIT 1: [log](fixture-local-inicial-fallo.txt) | `schema.sql` ya crea ajustes; el fixture local usa upsert. |
| Captura inicial | `AssertionError [ERR_ASSERTION]: área táctil de 44px`, EXIT 1: [log](capturas-inicial-fallo.txt), [medidas](visual-inicial-fallo.json) | La medición ocurrió durante la animación que escala el modal; esperar su final antes de medir. Los botones ya tenían min-height 44px. |
| E2E nuevo, primer intento | `307 !== 401`, EXIT 1: [log](test-cobros-cancelar-eliminar-e2e-inicial-fallo.txt) | La prueba adicional sin sesión esperaba 401, pero el middleware existente redirige a login (307). Se corrigió la expectativa, sin cambiar autenticación. |
| E2E existente, primer intento | `NotFoundError [PrismaClientKnownRequestError]: No Oportunidad found`, EXIT 1: [log](test-cobros-e2e-inicial-fallo.txt) | Completar el embudo Comercial Ámbar Rojo y sus etapas en el fixture desechable: [salida](fixture-embudo.txt). El test existente se conservó intacto. |
| Reintento inmediato de ambos E2E | `The input did not match the regular expression /next-auth.session-token/`, EXIT 1: [nuevo](test-cobros-cancelar-eliminar-e2e-login-fallo.txt), [existente](test-cobros-e2e-login-fallo.txt) | Se agotó el límite de logins por IP (30/15 minutos) de la app local. Reiniciar exclusivamente el proceso Next local de 127.0.0.1:3128 y repetir los dos tests afectados; ambos pasaron. El limitador y sus permisos no se editaron. |

[Resumen de la primera batería HTTP](http-resumen-inicial.txt) conserva los dos
EXIT 1 iniciales. El resumen final se reconstruye desde el último EXIT literal
de cada archivo mediante [resumir.ps1](resumir.ps1); los diez HTTP que ya pasaron
no se repitieron. Ningún fallo final, salvo Aurum, queda pendiente.

MRR sigue siendo contractual: cancelar un cargo no cancela el servicio ni cambia
la mensualidad del contrato. Se verificó que los cobros cancelados no aportan a
MRR actual/proyectado. No se sustituyó esa regla por un MRR calculado desde pagos.

## Rama y alcance

Rama `cobros-cancelar-eliminar`, creada directamente desde `modulos-fase-2`, base
`d433804c039652fcc334ddaf9b217f4ff7f4741c`. Un único commit de implementación,
documentación y evidencia; sin merge, push ni deploy. Los PROMPT-*.md locales
sin seguimiento quedaron fuera del commit.

La cancelación acepta pagados y cargos con abonos, exige Administrador y nota,
conserva pagos/monto_pagado/fecha/método/referencia y sigue siendo idempotente.
Incobrable mantiene el cierre existente. DELETE usa conModulo con admin:true,
FOR UPDATE y la misma transacción tenant para leer, validar y eliminar.
Solo permite cancelados y conserva mensualidades con periodo con el 409 pedido.

La UI reutiliza FilaCobro y los componentes Boton/Modal usados por RegistrarPago.
AccionCobro separa la confirmación de las acciones de la captura de un pago.
Solo Administrador ve Cancelar/Eliminar; ambas confirmaciones muestran cliente,
concepto y monto. Cancelar requiere motivo. Las mensualidades protegidas muestran
la explicación en Historial. [MODULOS.md](../../MODULOS.md) documenta la operación.

## Consultas revisadas

| Fuente | Resultado |
|---|---|
| `panel-ar-db.ts`: selección de pagos del mes | Excluye cancelado antes de examinar abonos JSON y pagos históricos sin abonos. Corrige ingreso y reparto del mes. |
| `panel-ar-db.ts`: calendario y totalCalendario | Excluye cancelados en ambas consultas. No aparecen ni se suman en el calendario/CSV. |
| `panel-ar-db.ts`: cargosPrevios de mensualidad | Excluye cancelados, también al determinar el crédito IA usado por pagos de meses anteriores del mismo cliente/periodo. |
| `panel-ar-db.ts`: cartera, totales y pendientes | Ya filtran pendiente/vencido; incobrable tiene su filtro propio. Sin modificación. |
| `panel-ar-db.ts`: MRR, proyección, clientes y pipeline | Derivan de contratos/oportunidades, sin sumar cobros. Sin modificación de su regla. |
| `/panel-ar` y `/api/panel-ar/exportar` | Consumen panelAR. El filtrado central corrige su ingreso, calendario y comisiones; no necesitaban consultas ni filtros duplicados en las rutas. |
| `alertas-ar-db.ts` | Ya consulta solamente pendiente/vencido y saldo positivo. Sin modificación. |
| `ar-vistas.ts`: saldoCobro y abonosCobro | Saldo cancelado = 0; abonos cancelados = [] para cálculos, sin borrar el historial guardado. |
| `/cobros`: Cobrado registrado de todos los periodos | Su agregado de montoPagado también excluye cancelados; los pagos legacy ya filtran estado pagado. |

## Resultados finales y salidas literales

Todos se ejecutaron desde `web/`, con el build servido mediante `next start`.

| Comprobación | Resultado | Evidencia |
|---|---|---|
| npx tsc --noEmit | EXIT 0 | [tipos.txt](tipos.txt) |
| npm run lint | EXIT 0 | [lint.txt](lint.txt) |
| npx next build | EXIT 0 | [build.txt](build.txt) |
| scripts/check-*.ts | 32/32; FALLOS 0 | [checks-resumen.txt](checks-resumen.txt) |
| Tests de BD | 25/26; solo Aurum falla | [db-resumen.txt](db-resumen.txt) |
| Tests HTTP | 12/12; FALLOS 0 | [http-resumen.txt](http-resumen.txt) |
| Todos prisma/scripts/test-*.ts | 37/38; solo Aurum falla | [test-resumen.txt](test-resumen.txt) |
| test-cobros-cancelar-eliminar-e2e.ts | EXIT 0 | [salida literal](test-cobros-cancelar-eliminar-e2e.txt) |
| UI y capturas | EXIT 0; sin errores JS ni desbordes | [capturas.txt](capturas.txt), [visual.json](visual.json) |

El test nuevo ejerce PATCH/DELETE autenticados con admin/agente de una organización
aislada y un admin de otra empresa. El agente tiene acceso al módulo: el 403
comprueba la prohibición de la acción, no un módulo denegado por defecto.
Prueba nota ausente/blanca (400), cancelación pagada y parcial, conservación de
pagos, cancelación concurrente idempotente, ingreso/cartera/CSV/calendario,
comisiones actuales y previas, saldo cero, DELETE pagado/pendiente/incobrable (409),
cancelado (204), mensualidad con periodo (409), módulo apagado (404), aislamiento
PATCH/DELETE (404) y DELETE concurrente (204/404).

Antes de medir el cron se genera el siguiente mes; luego se cancelan sus dos
mensualidades y se eliminan extras/anticipos/balances. Dos invocaciones reales
del cron generan 0 y el snapshot tenant completo de cobros permanece idéntico.
Las mensualidades canceladas conservan los mismos IDs y periodos.

El endpoint de alertas conserva su restricción a org plataforma: el E2E aislado
comprueba ese 404 y verifica la consulta alertasAR con su tenant de prueba.
La captura realiza además la cancelación y eliminación desde botones reales
(PATCH 200 / DELETE 204), comprueba acciones ocultas al agente y la mensualidad
sin Eliminar. Se inspeccionaron visualmente lista, historial y confirmaciones.

## Capturas

| Vista | 375 px | 1440 px |
|---|---|---|
| /cobros | [móvil](cobros-375.png) | [escritorio](cobros-1440.png) |
| Historial y mensualidad protegida | [móvil](cobros-historial-375.png) | [escritorio](cobros-historial-1440.png) |
| Confirmar cancelación de pagado | [móvil](cancelar-375.png) | [escritorio](cancelar-1440.png) |
| Confirmar eliminación | [móvil](eliminar-375.png) | [escritorio](eliminar-1440.png) |

Ancho documental = 375/1440 respectivamente. El main mide 375/1184 y su scrollWidth
coincide con clientWidth; los formularios quedan dentro del viewport. Botones
de acciones y confirmación tienen altura mínima de 44 px. No hubo errores JS.
La lista larga usa scroll vertical propio; la captura adicional del Historial
muestra la mensualidad protegida por encima de la navegación móvil fija.

## Entorno y reproducción

Contenedor exclusivamente nuevo `ambarcrm-cobros-cancelar-20261014`, postgres:16,
PostgreSQL 16.14, puerto **127.0.0.1:55453**, base crm en tmpfs.
[Identidad](contenedor.txt), [rol y versión](postgres-rol.txt).
crm_app: rolsuper=false, rolbypassrls=false; cobros tiene RLS activo y dueño distinto
del rol de la app: [estado final](estado-final-bd.txt).
El E2E nuevo comprueba también que sin tenant no puede leer ninguna fila.

Inicialización con archivos existentes sin editarlos:
[schema.sql](init-schema.txt), [multi-tenant.sql](init-multi-tenant.txt),
[actualizaciones.sql](init-actualizaciones.txt), todos EXIT 0.
[fixture-local.mjs](fixture-local.mjs) crea solo datos mínimos locales: admin,
MRR 4400, un balance pagado sin fecha y embudo/etapas requeridos por tests previos.
No se ejecutó ni modificó ningún seed. Se habilitó el módulo servidores en la
BD local porque su test forma parte de la batería; no se crearon servidores reales.
Los tests existentes dejan algunas orgs locales vacías; el contenedor completo
se elimina al terminar. Los fixtures nuevos de cancelación/captura se limpiaron.
La app local quedó detenida y el contenedor desechable fue eliminado:
[salida literal de limpieza](limpieza.txt).

Para repetir, crear el contenedor nuevo y ejecutar desde la raíz de AmbarCRM:

```powershell
docker run -d --name ambarcrm-cobros-cancelar-20261014 -e POSTGRES_USER=dueno -e POSTGRES_PASSWORD=dueno_test -e POSTGRES_DB=crm -p 127.0.0.1:55453:5432 --tmpfs /var/lib/postgresql/data postgres:16
pwsh -File docs/pruebas-cobros-cancelar-2026-10-14/preparar-bd.ps1
pwsh -File docs/pruebas-cobros-cancelar-2026-10-14/estaticos.ps1
pwsh -File docs/pruebas-cobros-cancelar-2026-10-14/ejecutar-pruebas.ps1 -Tipo checks
pwsh -File docs/pruebas-cobros-cancelar-2026-10-14/ejecutar-pruebas.ps1 -Tipo db
# En otra terminal, servir el build con las variables ficticias locales:
pwsh -File docs/pruebas-cobros-cancelar-2026-10-14/iniciar-app-local.ps1
pwsh -File docs/pruebas-cobros-cancelar-2026-10-14/ejecutar-pruebas.ps1 -Tipo http
pwsh -File docs/pruebas-cobros-cancelar-2026-10-14/resumir.ps1
```

Para capturas, cargar entorno-local.ps1 y ejecutar capturar.mjs con
PLAYWRIGHT_MODULE apuntando al index.mjs del Playwright del runtime de Codex.
Usa Edge instalado; sin añadir dependencias al proyecto. Reiniciar la app local
entre baterías repetidas/capturas si se agotó el límite de login; no desactivar
ni modificar el limitador.

## Lo que no se tocó

- Ninguna BD de producción, datos reales, VPS ni servicios externos.
- Ningún push, deploy, merge ni rama base; no se creó un PR.
- Esquema Prisma, archivos SQL, migraciones, índices y políticas RLS.
- Seeds, módulo/servicios de servidores, cron ni configuración de n8n.
- Autenticación, middleware, limitador de login, catálogo y permisos existentes.
- Comportamiento de incobrable y reglas contractuales de MRR.
- Dependencias, package.json, lockfiles y .env.
- Scripts check/test previos y los PROMPT-*.md del usuario.

La única ampliación de autorización es permitir a Administrador cancelar pagados,
y la nueva ruta DELETE exige Administrador. Todas sus operaciones de BD usan
transaccionTenant; no se cambió RLS ni se necesita SQL nuevo.
