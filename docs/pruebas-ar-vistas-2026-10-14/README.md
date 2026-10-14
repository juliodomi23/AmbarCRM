# Entrega · vistas AR · 2026-10-14

## Fallo pendiente

**`test-lealtad-aurum.ts`: `EXIT 1`, `FALLO: AssertionError [ERR_ASSERTION]: faltan variables de la prueba`.**
Es el único fallo de los 36 `test-*.ts`, previsto por el prompt: requiere Aurum real.
No se configuraron `AURUM_URL`, `AURUM_SLUG`, `AURUM_CLAVE` ni `AURUM_WEBHOOK_SECRET`.
La salida y el stack originales están en [test-lealtad-aurum.txt](test-lealtad-aurum.txt).
No se conectó un servicio externo para hacer pasar la prueba.

## Alcance entregado

Rama **`modulos-ar-vistas`**, creada de `modulos-fase-2` en `c1f9503`.
Commits de código: `b41d687` (abonos/baja), `e4846f5` (datos/embudo),
`72b7189` (vistas y prueba E2E). Cambios y comprobaciones locales; sin push ni deploy.

- Contratos agrupados, bajas ocultas con interruptor URL y contador; producción
  verde, mensualidad y día visibles, detalle con cobros y acciones directas.
- Nuevo cobro de los cuatro conceptos y Registrar pago con monto, fecha, método
  y referencia. Abonos preservan el importe original, el historial y saldo;
  fila bloqueada y clave de pago impiden duplicar. Cancelar/incobrable exige
  Administrador y nota. Recordatorio sigue siendo manual.
- Baja confirmada cancela únicamente abiertos con vencimiento posterior a la
  fecha indicada, conserva lo pagado y deudas anteriores. Sin fecha de vencimiento
  no se supone que un cobro sea futuro.
- Panel con KPI y barras CSS, ingreso por abonos reales, cartera y CSV por saldo.
  Incobrables siguen en cartera. Colores compartidos; sin módulos, tablas o dependencias nuevos.
- Cobros incorpora **dos columnas aditivas** en Prisma y SQL: `monto_pagado` y
  `pagos` JSON. Pagados históricos siguen liquidados aunque su acumulado sea cero;
  sin fecha conocida no se asignan a un mes. No se cambió `schema.sql` base.
- Ajustes elimina solo Pie Feliz/web y sus cobros en la org indicada; seed actualizado.
  Embudo con 9 clientes y 8 prospectos, Coparmex fuera, selector visible, búsqueda
  en servidor y paginación explícita de hasta 200 por columna.

Una oportunidad comercial ganada no convierte el contrato en producción:
Alwater y SEMBID conservan su estado operativo desconocido y no suman MRR.
Contrato pausado o firmado con estado por confirmar mantiene el historial de la venta.
Valor de oportunidad: cierre conocido, incluido cero del trueque; si falta,
mensualidad × 12 con aviso y Nota; varios servicios sumados por cliente.
Cambiar contrato actualiza su oportunidad canónica en la misma transacción.

## Resultados

| Comprobación | Resultado literal | Evidencia |
|---|---|---|
| Aurum real | **`EXIT 1`; `faltan variables de la prueba`** | [salida](test-lealtad-aurum.txt) |
| Prisma validate | `The schema at prisma\schema.prisma is valid 🚀`; `EXIT 0` | [salida](prisma.txt) |
| Tipos | `EXIT 0` | [salida](tipos.txt) |
| Lint | `EXIT 0` | [salida](lint.txt) |
| Build final | `EXIT 0` | [salida](build.txt) |
| Todos los checks, repetidos tras corregir bordes | `TOTAL 31; FALLOS 0` | [resumen](checks-resumen.txt) |
| Batería DB | `TOTAL 26; FALLOS 1` (solo Aurum) | [resumen](db-resumen.txt) |
| Batería HTTP | `TOTAL 10; FALLOS 0` | [resumen](http-resumen.txt) |
| E2E AR sobre compilación final | `EXIT 0`; `cero envíos` | [salida](test-cobros-e2e-final.txt) |
| Concurrencia cobros | `"pagosAplicados":1,"mensualidades":1,"creadosPorCron":[1,0]`; `EXIT 0` | [salida](test-concurrencia-cobros.txt) |
| Ajustes sobre seed anterior, corrida 1 | `eliminados 1 contratos web de Pie Feliz y 1 cobros`; 7 oportunidades creadas | [salida](ajustes-1.txt) |
| Ajustes, corrida 2 | `eliminados 0 contratos web de Pie Feliz y 0 cobros`; `"creadas":0,"actualizadas":0` | [salida](ajustes-2.txt) |
| Ajustes en inicial, dos corridas | `"clientes":9,"creadas":0,"actualizadas":0`; `EXIT 0` | [primera](ajustes-inicial-1.txt), [segunda](ajustes-inicial-2.txt) |
| Conteos, alcance e historial | `11 → 10 contratos y 10 → 17 oportunidades`; `otros tenants intactos por SHA-256 en 78 tablas`; `EXIT 0` | [salida](ajustes-verificacion.txt) |
| Migración repetida dos veces | `EXIT 0` / `EXIT 0` | [primera](migracion-1.txt), [segunda](migracion-2.txt) |
| Rol crm_app | `rolsuper=f`, `rolbypassrls=f`; `EXIT 0` | [salida](rol-migracion.txt) |
| Guardas de ajustes | `EXIT 1 (rechazo esperado)` en los tres casos | [producción](guarda-produccion.txt), [sin autorización](guarda-sin-autorizacion.txt), [sin org](guarda-sin-org.txt) |
| Flujo real en navegador | `EXIT 0`; abono 30/80, saldo 50→0, duplicado 409, baja y búsqueda | [salida](interfaz.txt), [datos](interfaz.json) |
| Visual | 8 tamaños sin overflow; contraste mínimo `7.29`; sin errores JS | [mediciones](visual.json), [revisión](../revision-visual-2026-10-14.md) |

Las salidas son stdout/stderr sin resumir, más su código de salida. La tabla de
[todas las pruebas](resultados.md) enlaza cada uno de los 31 checks y 36 tests.
El runner archiva fallos por archivo; su propio proceso no sustituye esos códigos.

## Entorno y repetición

PostgreSQL 16 desechable `ambarcrm-merge-ar-20261013`, puerto local 55453;
app solo en 127.0.0.1:3128. Rol app sin privilegios de dueño ni BYPASSRLS.
Datos con nombres del seed y credenciales/teléfonos de prueba; ninguna conexión a
BD de producción. Antes de probar idempotencia se repuso una web de Pie Feliz
del seed anterior en AR y otra homónima en la org de control: la ajena se conservó.
Snapshots de todas las tablas multi-tenant demuestran otros tenants intactos.

```powershell
& './docs/pruebas-ar-vistas-2026-10-14/ejecutar-pruebas.ps1' -Tipo checks
& './docs/pruebas-ar-vistas-2026-10-14/ejecutar-pruebas.ps1' -Tipo db
& './docs/pruebas-ar-vistas-2026-10-14/ejecutar-pruebas.ps1' -Tipo http
```

El último requiere la app de pruebas iniciada con `iniciar-app-local.ps1`.
Ver [verificar-ajustes.mjs](verificar-ajustes.mjs) y los tres snapshots para datos.

## Comando futuro en la consola del servicio app

Desde `/app`, después de tener desplegado y migrado este código, Julio puede ejecutar:

```sh
ORG_SLUG=inicial ALLOW_DEMO_SEED=1 node scripts/ajustes-ar.mjs
```

No se ejecutó contra producción. Exige org existente y guarda idéntica al seed.
**Si la consola tiene `NODE_ENV=production`, se bloquea incluso con `ALLOW_DEMO_SEED=1`.**
No se modificó ni se eludió esa guarda. `docker-compose.yml` y Dockerfile actuales
no definen `NODE_ENV` para la consola; un override externo puede hacerlo.
No necesita variables nuevas permanentes del compose.

## Archivos y límites

[Listado de archivos tocados](archivos-tocados.txt); código agrupado en:

- Prisma: modelo Cobro y `actualizaciones.sql`.
- Datos: seed AR, ajustes y `scripts/lib/ar-embudo.mjs`.
- Servidor: contratos/cobros, panel, recordatorio por saldo, CSV y servicio de embudos.
- UI: cuatro vistas, detalle de contrato, siete componentes AR y Board existente.
- Pruebas: check AR, DB AR y E2E AR; documentación, logs, snapshots y capturas.

Sin verificar: teléfono/dispositivo real, lector de pantalla, Aurum real y producción.
Sin envío real de WhatsApp ni cambios a conversaciones de Villafuerte.
Los prompts locales del usuario quedan sin seguimiento; `modulos-fase-2` y `main`
no se modificaron en esta tarea.

Persisten las dudas de datos del seed anterior: Dentu (cierre/estado provisional),
Exi (monto exacto del anticipo), SEMBID (estado y mensualidad), Alwater (estado y
día de cobro), fecha de baja de Futura Fortuna y montos de prospectos sin documento.
No se completaron por suposición. MRR $4,400 conserva la hipótesis provisional
de Dentu del seed, no certifica cobros reales de producción.
