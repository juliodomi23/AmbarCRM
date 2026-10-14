# Verificación del merge de módulos AR · 2026-10-13

**Fallos de la batería completa:**

- [test-lealtad-aurum.ts](test-lealtad-aurum.txt): `EXIT 1`. FALLO: AssertionError [ERR_ASSERTION]: faltan variables de la prueba

La prueba de lealtad necesita un **Aurum real de pruebas**, con negocio,
clienta y credenciales de prueba. No estaban configuradas sus cuatro variables
([presencia en el entorno](aurum-entorno.txt)); se mantuvieron vacías para
evitar conexiones a un servicio externo no identificado como prueba. No se
usaron credenciales de producción ni se sustituyó ese servicio por un mock.
El flujo real de lealtad queda sin verificar. El test no se modificó.

Se ejecutaron los 36 archivos `prisma/scripts/test-*.ts`: **35 pasaron; 1 con fallo**.
Los checks terminaron con `TOTAL 31; FALLOS 0`.

## Merge local

Commit de merge: `bba4eee5989db09c5ea661c40d18073b9afb9a8c`. Sin conflictos, estrategia `ort`.
La rama activa es `modulos-fase-2`. Local y referencia remota inicial:
`9f147e1` y `a0b5fe4`; los seis commits de AR partían de la base local.
El único trabajo posterior al merge es documentación y evidencia de pruebas.
Los prompts locales siguen sin seguimiento y no se añadieron.

[Estado inicial literal](estado-inicial.txt) · [hash y git log --oneline -9 al hacer el merge](merge.txt).

`git log --oneline -9` al terminar el merge:

```text
bba4eee merge: módulos Ámbar Rojo (contratos, cobros y panel AR)
9739cd1 docs(ar): cerrar prueba HTTP y revisión visual de la compilación final
06ae88d docs(ar): registrar pruebas, capturas y datos pendientes de confirmar
874b790 fix(ar): dejar vencimientos por confirmar y permitir definir fechas
5d61efe fix(ar): evitar recortes de formularios en filas editables
45a13fb feat(ar): gestionar servicios, cobranza y MRR con datos por confirmar
1f09eb0 feat(ar): aislar contratos y cobros y evitar pagos duplicados
9f147e1 fix(template-n8n): cabeceras de las herramientas del agente y etiqueta requiere_atencion
a0b5fe4 docs: fase 2 en pausa hasta la aprobación de Meta
```

## Comprobaciones

| Comprobación | Resultado literal / evidencia |
|---|---|
| Prisma | [`EXIT 0`, esquema válido](prisma.txt) |
| TypeScript | [`EXIT 0`](tipos.txt) |
| Lint | [`EXIT 0`](lint.txt) |
| Next build | [`EXIT 0`](build.txt) |
| Todos los checks | [`TOTAL 31; FALLOS 0`](checks-resumen.txt) |
| Tests sin servidor Next | [`TOTAL 26; FALLOS 1`](db-resumen.txt) |
| Tests HTTP | [TOTAL 10; FALLOS 0](http-resumen.txt) |
| Migración, primera aplicación | [`EXIT 0`](migracion-1.txt) |
| Migración, segunda aplicación seguida | [`EXIT 0`](migracion-2.txt) |
| Config restringida antes | [Citas: Administrador / Recepcionista](control-antes.txt) |
| Config tras primera y segunda migración | [`OK: config restringida intacta`](control-despues-1.txt), [segunda](control-despues-2.txt) |
| Rol crm_app y políticas AR | [`rolsuper=f`, `rolbypassrls=f`, DEFAULT y org_isolation](rls-y-control.txt) |
| Seed, primera y segunda ejecución | [`EXIT 0`, 18 contactos / 11 contratos / 6 cobros / MRR $4400.00](seed-1.txt), [segunda](seed-2.txt) |
| Seed: idempotencia y otras orgs | [`EXIT 0`, conteos de 78 tablas iguales y SHA-256 ajenos intactos](seed-verificacion.txt) |
| NODE_ENV=production + ALLOW_DEMO_SEED=1 | [`EXIT 1 (bloqueo esperado)`](seed-production-allow.txt) |
| NODE_ENV=production sin ALLOW_DEMO_SEED | [`EXIT 1 (bloqueo esperado)`](seed-production-sin-allow.txt) |
| Entorno de prueba sin ALLOW_DEMO_SEED | [`EXIT 1 (bloqueo esperado)`](seed-test-sin-allow.txt) |

Los tres intentos bloqueados no modificaron datos. En las ejecuciones
autorizadas se usó `NODE_ENV=test` y `ALLOW_DEMO_SEED=1`.
[Snapshots](seed-snapshots.txt): [antes](snapshot-antes.json), [primero](snapshot-seed-1.json),
[segundo](snapshot-seed-2.json), [tras bloqueos](snapshot-guardas.json).
Cada snapshot compara todas las filas de las otras orgs, no solo sus conteos.

### Los 36 tests, uno por archivo

| Script | Resultado literal |
|---|---|
| [test-lealtad-aurum.ts](test-lealtad-aurum.txt) | `EXIT 1` |
| [test-a3-e2e.ts](test-a3-e2e.txt) | `EXIT 0` |
| [test-a3-fixes-e2e.ts](test-a3-fixes-e2e.txt) | `EXIT 0` |
| [test-a4-e2e.ts](test-a4-e2e.txt) | `EXIT 0` |
| [test-aislamiento.ts](test-aislamiento.txt) | `EXIT 0` |
| [test-bot-api.ts](test-bot-api.txt) | `EXIT 0` |
| [test-caja-a2-e2e.ts](test-caja-a2-e2e.txt) | `EXIT 0` |
| [test-caja-dinero.ts](test-caja-dinero.txt) | `EXIT 0` |
| [test-caja-e2e.ts](test-caja-e2e.txt) | `EXIT 0` |
| [test-cobros-db.ts](test-cobros-db.txt) | `EXIT 0` |
| [test-cobros-e2e.ts](test-cobros-e2e.txt) | `EXIT 0` |
| [test-concurrencia-caja-a2.ts](test-concurrencia-caja-a2.txt) | `EXIT 0` |
| [test-concurrencia-caja.ts](test-concurrencia-caja.txt) | `EXIT 0` |
| [test-concurrencia-cobros.ts](test-concurrencia-cobros.txt) | `EXIT 0` |
| [test-concurrencia-cotizaciones.ts](test-concurrencia-cotizaciones.txt) | `EXIT 0` |
| [test-concurrencia-nota-credito.ts](test-concurrencia-nota-credito.txt) | `EXIT 0` |
| [test-concurrencia-pedidos.ts](test-concurrencia-pedidos.txt) | `EXIT 0` |
| [test-concurrencia-resenas.ts](test-concurrencia-resenas.txt) | `EXIT 0` |
| [test-concurrencia-retail.ts](test-concurrencia-retail.txt) | `EXIT 0` |
| [test-concurrencia-sinred.ts](test-concurrencia-sinred.txt) | `EXIT 0` |
| [test-concurrencia-varias-cajas.ts](test-concurrencia-varias-cajas.txt) | `EXIT 0` |
| [test-cotizaciones-e2e.ts](test-cotizaciones-e2e.txt) | `EXIT 0` |
| [test-cotizaciones-zona.ts](test-cotizaciones-zona.txt) | `EXIT 0` |
| [test-cupos-concurrentes.ts](test-cupos-concurrentes.txt) | `EXIT 0` |
| [test-paridad-precios.ts](test-paridad-precios.txt) | `EXIT 0` |
| [test-pedidos-e2e.ts](test-pedidos-e2e.txt) | `EXIT 0` |
| [test-precios-promociones.ts](test-precios-promociones.txt) | `EXIT 0` |
| [test-referencias.ts](test-referencias.txt) | `EXIT 0` |
| [test-reportes-cuadre.ts](test-reportes-cuadre.txt) | `EXIT 0` |
| [test-resenas-e2e.ts](test-resenas-e2e.txt) | `EXIT 0` |
| [test-reservas-concurrentes.ts](test-reservas-concurrentes.txt) | `EXIT 0` |
| [test-sinred-e2e.ts](test-sinred-e2e.txt) | `EXIT 0` |
| [test-sql-inventario-negativo.ts](test-sql-inventario-negativo.txt) | `EXIT 0` |
| [test-tours-dinero.ts](test-tours-dinero.txt) | `EXIT 0` |
| [test-vencimiento-pedidos.ts](test-vencimiento-pedidos.txt) | `EXIT 0` |
| [test-webhook-manual.ts](test-webhook-manual.txt) | `EXIT 0` |

### Los 31 checks, uno por archivo

| Script | Resultado literal |
|---|---|
| [check-a3.ts](check-a3.txt) | `EXIT 0` |
| [check-arquitectura-modulos.ts](check-arquitectura-modulos.txt) | `EXIT 0` |
| [check-audio-ogg.ts](check-audio-ogg.txt) | `EXIT 0` |
| [check-aurum-webhook.ts](check-aurum-webhook.txt) | `EXIT 0` |
| [check-busqueda.ts](check-busqueda.txt) | `EXIT 0` |
| [check-caja-a2.ts](check-caja-a2.txt) | `EXIT 0` |
| [check-caja-offline.ts](check-caja-offline.txt) | `EXIT 0` |
| [check-caja-sinred.ts](check-caja-sinred.txt) | `EXIT 0` |
| [check-caja.ts](check-caja.txt) | `EXIT 0` |
| [check-campos-personalizados.ts](check-campos-personalizados.txt) | `EXIT 0` |
| [check-cantidades-retail.ts](check-cantidades-retail.txt) | `EXIT 0` |
| [check-citas.ts](check-citas.txt) | `EXIT 0` |
| [check-clientes-automotriz.ts](check-clientes-automotriz.txt) | `EXIT 0` |
| [check-contratos-cobros.ts](check-contratos-cobros.txt) | `EXIT 0` |
| [check-cotizaciones.ts](check-cotizaciones.txt) | `EXIT 0` |
| [check-demo.ts](check-demo.txt) | `EXIT 0` |
| [check-lealtad.ts](check-lealtad.txt) | `EXIT 0` |
| [check-legal.ts](check-legal.txt) | `EXIT 0` |
| [check-pedidos-en-linea.ts](check-pedidos-en-linea.txt) | `EXIT 0` |
| [check-permisos-modulos.ts](check-permisos-modulos.txt) | `EXIT 0` |
| [check-plantilla-meta.ts](check-plantilla-meta.txt) | `EXIT 0` |
| [check-precios.ts](check-precios.txt) | `EXIT 0` |
| [check-proxy.ts](check-proxy.txt) | `EXIT 0` |
| [check-reportes-a4.ts](check-reportes-a4.txt) | `EXIT 0` |
| [check-resenas.ts](check-resenas.txt) | `EXIT 0` |
| [check-reservas.ts](check-reservas.txt) | `EXIT 0` |
| [check-retail.ts](check-retail.txt) | `EXIT 0` |
| [check-seeds-seguridad.ts](check-seeds-seguridad.txt) | `EXIT 0` |
| [check-seguridad.ts](check-seguridad.txt) | `EXIT 0` |
| [check-sw-push.ts](check-sw-push.txt) | `EXIT 0` |
| [check-viajes-academia.ts](check-viajes-academia.txt) | `EXIT 0` |

## Entorno y preparación

PostgreSQL 16.14 en un contenedor nuevo `ambarcrm-merge-ar-20261013`,
publicado solo en `127.0.0.1:55453`. [Identidad y puertos](contenedor.txt).
Se detuvo únicamente el contenedor desechable anterior `ambarcrm-ar-prueba`
para liberar ese puerto, que está exigido por la guardia del E2E de AR.
No se utilizó `ambarcrm-db` ni ninguna BD de producción.

Inicialización: [schema.sql](init-schema.txt), [multi-tenant.sql](init-multitenant.txt)
y [actualizaciones.sql de a0b5fe4](init-base-fase-2.txt), antes de crear el control.
Después se aplicó el SQL de la rama fusionada dos veces seguidas.

La preparación inicial del control tuvo un error de quoting de PowerShell:
[`unterminated quoted string`, `EXIT 1`](control-intento-inicial.txt).
Se pasó el mismo SQL por stdin y se completó correctamente, sin editar SQL
de aplicación. La comparación antes/después pasó las dos veces.

El arranque desde herramientas fue rechazado por la revisión automática:
[`blocked by policy`](arranque-herramientas.txt). Julio inició el script
local en 3128; `/api/auth/csrf` respondió `HTTP 200` y se ejecutó la batería HTTP.
Los errores 42501 del [test-bot-api](test-bot-api.txt) son rechazos RLS/permisos
comprobados por el test, que terminó con `EXIT 0`; se conserva su salida íntegra.
`git diff --check` señaló espacios finales y líneas vacías de psql, Prisma
y Next en los logs literales. Esos archivos se conservaron sin recortar la salida;
la documentación y los scripts de reproducción se revisaron excluyendo los logs.

## Qué queda sin verificar

- Flujo real de lealtad contra Aurum, por ausencia de su servicio y credenciales de pruebas.
- Teléfono real, entrega/recepción real de WhatsApp y lector de pantalla.
- Producción: respaldo, redeploy, migración, seed y humo de Villafuerte y AR.
  Esas operaciones se documentaron, no se ejecutaron. Tampoco se hizo push.
- El entorno de la consola de EasyPanel: si exporta `NODE_ENV=production`,
  el seed está bloqueado incluso con `ALLOW_DEMO_SEED=1`. Compose y Dockerfile
  no fijan esa variable; se debe comprobar la consola antes del paso manual.

[Checklist de despliegue y respaldo](../DESPLIEGUE-MODULOS-AR.md).
No se cambiaron reglas de negocio, los tests ni código de la app para ocultar fallos.
La lista de datos AR pendientes de confirmar continúa en
[la entrega original](../entrega-modulos-ar-2026-10-13.md).
