# Herramientas previas al merge

Preparadas y probadas exclusivamente en PostgreSQL 16 desechable, `127.0.0.1:55450`.
Nada en esta carpeta debe conectarse automáticamente a producción.

| Archivo | Operación | Uso |
|---|---|---|
| `verificar-rls.sql` | Solo SELECT, transacción READ ONLY. | Con el mismo rol de DATABASE_URL de app y sin `app.current_org` fijado. Copia ambas consultas de `docs/verificar-rls.md`. |
| `canales-token-legacy.sql` | Solo SELECT, transacción READ ONLY. | Con el dueño para abarcar todas las orgs. Copia las consultas de `docs/canales-token-legacy.md`; no imprime tokens. |
| `check-env-despliegue.ts` | Lectura de código y Compose locales. | Examina AST de `web/src` y `next.config.mjs`, compara con environment/args de app; no lee `.env` ni valores del panel. Exit 1 si falta un mapeo obligatorio. |
| `ensayar-migracion.mjs` | Crea una nueva BD y datos sintéticos en el contenedor desechable fijo. | Ensayo reproducible, no es una verificación de solo lectura ni admite destino productivo. Ver `docs/ensayo-migracion-pre-merge-2026-10-17.md`. |

## Verificación de SQL

Desde la raíz, con el contenedor de prueba creado y rol `crm_app` preparado:

```powershell
Get-Content scripts/pre-merge/verificar-rls.sql -Raw -Encoding utf8 | docker exec -i -e 'PGOPTIONS=-c default_transaction_read_only=on' ambarcrm-premerge-20261017 psql -X -U crm_app -d crm -v ON_ERROR_STOP=1
Get-Content scripts/pre-merge/canales-token-legacy.sql -Raw -Encoding utf8 | docker exec -i -e 'PGOPTIONS=-c default_transaction_read_only=on' ambarcrm-premerge-20261017 psql -X -U dueno -d crm -v ON_ERROR_STOP=1
```

Esperado RLS: `crm_app | f | f | f | 0 | 0`, contactos visibles sin empresa = 0.
Esperado operativo tokens: `con_token_plano=0`, `solo_plano=0`; si hay filas,
el script informa y no cambia nada. Exit 0 significa consulta ejecutada, no
que los datos cumplan el objetivo: hay que revisar los valores.

En el ensayo se comprobó deliberadamente el caso legacy: seis canales, cuatro con
token plano, cuatro con cifrado y dos solo plano. El detalle muestra IDs, nombre,
organización, booleano de cifrado y longitud; nunca el valor del token.

## Verificación de variables

Desde `web/`:

```powershell
npx --yes tsx ../scripts/pre-merge/check-env-despliegue.ts
```

Se usa el TypeScript ya instalado en `web/node_modules`; no se añadieron librerías.
El parámetro `--compose RUTA` permite comprobar una copia local del Compose.
Se excluyen tests y seeds del contrato del contenedor web; `NODE_ENV` y el ID
público de build se identifican como generados por Next/configuración.

Resultado real, 31 variables referenciadas:

- **Antes:** faltaba `MESSENGER_VERIFY_TOKEN`, necesaria para el GET de verificación
  del webhook. Se añadió su mapeo en `docker-compose.yml` en esta tarea, para que
  al desplegar solo quede introducir el valor en el panel.
- **META_APP_ID y META_APP_SECRET ya estaban mapeadas** antes de empezar. No se
  encontró el faltante esperado en el encargo; no se consultaron sus valores reales.
- **Después:** cero faltantes obligatorias, exit 0.
- Sin mapeo opcional: `ANTHROPIC_MODEL`, `BOT_AUTH_FAIL_MAX`,
  `BOT_AUTH_FAIL_WINDOW_MS`, `BOT_RATE_LIMIT_MAX`, `BOT_RATE_LIMIT_WINDOW_MS`,
  `BUILD_ID`. El código tiene valores predeterminados. Si Julio necesita cambiar
  esos defaults mediante el panel, habrá que mapearlos; hoy se usan los defaults.

Control negativo: una copia del Compose sin los dos mapeos META devuelve exit 1
con `META_APP_ID`, `META_APP_SECRET` y `MESSENGER_VERIFY_TOKEN` faltantes. Así se
comprueba que las variables esperadas sí serían detectadas si se retiran.
TypeScript del verificador también pasó con `tsc --noEmit`, sin alterar el proyecto.

**Límite:** un nombre mapeado no demuestra que el panel tenga un valor correcto.
🛑 Julio confirma los valores del panel durante el despliegue; este script no
accede al panel, a la BD ni a secretos.

Evidencia en `docs/pruebas-pre-merge-2026-10-17/`: `env-antes.json`, `env-final.json`,
`env-control-sin-meta.json`, `rls-app.txt`, `rls-ensayo.txt`, `tokens-ensayo.txt`.
