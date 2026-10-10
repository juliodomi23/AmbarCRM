# Despliegue de la API del bot en una base existente

Esta guía lleva a una base **ya en producción** (multi-tenant, app conectada como `crm_app`) el conjunto
completo del bot: seguridad, auditoría, citas y cotizaciones. Todo el SQL es aditivo e idempotente.

## 0. Dependencias de despliegue (qué debe existir antes)

| Dependencia | Detalle |
|---|---|
| **Fase 2 en producción** | El bot de citas y cotizaciones usa tablas y código que solo existen en la rama de fase 2 (`cotizaciones`, `cotizacion_partidas`, `servicios_reserva`, `horarios_doctor`, módulos por empresa…). `meta-tech-provider` no los tiene. Desplegar este código **es** desplegar fase 2: `actualizaciones.sql` es acumulativo. |
| **Módulos activos por empresa** | `citas` (agendar y confirmar/cancelar), `reservas_en_linea` (aporta servicios, profesionales y horarios; sin servicios activos la disponibilidad responde 404) y `cotizaciones`. Se activan en Configuración → Módulos. Sin el módulo, las rutas responden `404 módulo no activo`. |
| **Servicios y horarios cargados** | Al menos un servicio activo con profesional y horario semanal (Reservas en línea). |
| **Plantilla de cotización aprobada en Meta** | Necesaria para enviar la cotización **fuera de la ventana de 24 h**. Se configura como `plantillaCotizacion` (`name` y `language`) en el módulo Cotizaciones y debe estar `APPROVED` en la WABA del canal. Cuerpo con 3 variables: nombre, folio y enlace. Dentro de las 24 h se manda texto libre y no hace falta. Mientras Meta no la apruebe, el envío fuera de ventana responde `409 ventana_cerrada_sin_plantilla` o `plantilla_no_aprobada`. |
| **`wabaId` en el canal** | Sin él no se puede consultar el estado de la plantilla: `409 canal_sin_waba`. |
| **`META_TOKEN_ENCRYPTION_KEY`** | Obligatoria: cifra los tokens de Meta y el secreto de firma de cada bot. Si se pierde, no se pueden descifrar. |
| **`NEXTAUTH_URL`** | URL pública del CRM: forma los enlaces de cotización y de gestión de citas. |
| **Rol de la app sin BYPASSRLS** | Sin esto el aislamiento entre empresas no existe (ver paso 1). |

## 1. Antes de tocar nada

1. **Respaldo** completo: `pg_dump -Fc "$DATABASE_URL_DUENO" > respaldo-antes-bot.dump`, y prueba de restauración en otra base.
2. **Verifica el rol de la app** con la consulta de [verificar-rls.md](verificar-rls.md), conectado con el `DATABASE_URL`
   real. Debe dar todo `f` y `0`. Si no, **detente** y corrige el rol antes de seguir.

## 2. Orden exacto de pasos

Todo el SQL se corre con el usuario **dueño** (no `crm_app`) y con `-v ON_ERROR_STOP=1`.

| # | Paso | Cuándo |
|---|---|---|
| 1 | `psql "$DATABASE_URL_DUENO" -v ON_ERROR_STOP=1 -f web/prisma/sql/multi-tenant.sql` | **Solo** si la base aún no es multi-tenant (PARTES A→B→C; ver `MULTI-TENANT.md`). Una producción que ya corre con `crm_app` **no** lo necesita: sáltalo. |
| 2 | `psql "$DATABASE_URL_DUENO" -v ON_ERROR_STOP=1 -f web/prisma/sql/actualizaciones.sql` | Siempre. Crea `bots.signing_secret`, `bots.asesor_id`, `auditoria_bot` y todo lo de fase 2. Con Docker lo corre el servicio `db-migrate`. |
| 3 | Si en el paso 1 corriste `multi-tenant.sql`: **vuelve a correr `actualizaciones.sql`** (paso 2) | La PARTE C de `multi-tenant.sql` hace `GRANT … ON ALL TABLES` y `ALTER DEFAULT PRIVILEGES`, que devuelven `UPDATE`/`DELETE` a `crm_app` sobre `auditoria_bot`. `actualizaciones.sql` los revoca (`REVOKE UPDATE, DELETE, TRUNCATE`). El orden **multi-tenant.sql → actualizaciones.sql** es obligatorio; repetirlo es seguro. |
| 3b | Revisa los permisos (bloque **E** del mismo archivo, ya incluido en el paso 2) | `bots.permisos` queda así: los bots que ya existían reciben **solo** `leer_perfil`, `enviar_mensaje`, `notas_internas`, `mover_embudo` y `handoff` (lo que sus rutas de producción les permitían); los nuevos nacen con `leer_perfil`, `enviar_mensaje`, `notas_internas` y `handoff`. `crear_tarea`, `agendar_cita`, `cotizar` y el resto se activan después por cliente (sección 7). La migración solo toca filas con `permisos` NULL: volver a correr el archivo no pisa lo que el admin edite. |
| 4 | Agrega las variables de entorno (sección 3) | Antes de arrancar la app. |
| 5 | Construye y despliega la app | `npm run build` ejecuta `prisma generate`. La app **no** corre DDL (`crm_app` no puede). |
| 6 | Verificaciones (sección 4) | Después del despliegue. |
| 7 | Por empresa: activar módulos, cargar servicios, generar el secreto de firma de cada bot (Configuración → Bots → *Generar secreto*) y configurar la verificación en n8n (`api-bot.md`) | Al entregar el bot al cliente. Los bots existentes se siguen enviando **sin firma** hasta que generes un secreto. |

## 3. Variables de entorno

Todas opcionales; el valor mostrado es el predeterminado.

```env
# Peticiones permitidas por token de bot en la ventana
BOT_RATE_LIMIT_MAX=300
BOT_RATE_LIMIT_WINDOW_MS=60000
# Intentos con token inválido por IP en la ventana (después responde 429)
BOT_AUTH_FAIL_MAX=20
BOT_AUTH_FAIL_WINDOW_MS=300000
```

Requeridas (ya existen en producción): `META_TOKEN_ENCRYPTION_KEY`, `NEXTAUTH_URL` y `DATABASE_URL` (rol `crm_app`).
El límite por IP depende de `cf-connecting-ip` / `x-forwarded-for` (ver `api-bot.md`).

## 4. Qué verificar después

1. **Rol y RLS:** la consulta de [verificar-rls.md](verificar-rls.md) con el `DATABASE_URL` de la app.
2. **Bitácora de solo agregar** (como dueño):
   ```sql
   SELECT privilege_type FROM information_schema.role_table_grants
   WHERE grantee = 'crm_app' AND table_name = 'auditoria_bot' ORDER BY 1;   -- solo INSERT y SELECT
   ```
3. **Columnas y tabla:**
   ```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'bots' AND column_name IN ('signing_secret', 'asesor_id', 'permisos');   -- 3 filas
   SELECT relrowsecurity FROM pg_class WHERE relname = 'auditoria_bot';                       -- t
   ```
   **Permisos de los bots existentes** (ninguno debe quedar en NULL):
   ```sql
   SELECT id, nombre, permisos FROM bots ORDER BY id;
   SELECT count(*) FROM bots WHERE permisos IS NULL;   -- 0
   -- Los bots que ya existían deben tener exactamente los 5 permisos de producción
   -- (si el admin ya editó alguno, la diferencia es esperada):
   SELECT id, nombre FROM bots
   WHERE NOT (permisos @> ARRAY['leer_perfil','enviar_mensaje','notas_internas','mover_embudo','handoff']);
   SELECT id, nombre, permisos FROM bots
   WHERE permisos && ARRAY['crear_tarea','agendar_cita','cotizar'];   -- vacío hasta que actives alguno
   ```
4. **Aislamiento** (en una base desechable o de staging, nunca en producción):
   `DATABASE_URL=<crm_app> ADMIN_DATABASE_URL=<dueño> npx tsx prisma/scripts/test-aislamiento.ts`.
5. **Humo con un bot de prueba** (ejemplos en `api-bot.md`): GET de una conversación → 200; token inválido → 401;
   un bot atado al canal B sobre una conversación del canal A → 403.
6. **Bitácora:** tras una acción del bot, `SELECT accion, created_at FROM auditoria_bot ORDER BY id DESC LIMIT 5;`.

## 5. Cómo revertir

El cambio de base es aditivo: **la app anterior sigue funcionando** con el esquema nuevo (columnas nullables y
una tabla sin uso). La reversión normal es solo de código:

1. Redespliega la imagen anterior de la app. No hace falta tocar la base.
2. Quita las variables `BOT_*` (opcional; el código anterior las ignora).

Revertir también el esquema solo si es imprescindible y **después de un respaldo**. Perderás la bitácora del bot
y los secretos de firma (los bots dejarán de firmar):

```sql
DROP TABLE IF EXISTS auditoria_bot;
ALTER TABLE bots DROP COLUMN IF EXISTS signing_secret;
ALTER TABLE bots DROP COLUMN IF EXISTS asesor_id;
ALTER TABLE bots DROP COLUMN IF EXISTS permisos;
```

Revertir solo los permisos (el código anterior los ignora y los bots dejan de estar limitados) es solo
`ALTER TABLE bots DROP COLUMN IF EXISTS permisos;`. Para dejar a todos los bots exactamente con
los 5 permisos de producción sin borrar la columna:
`UPDATE bots SET permisos = ARRAY['leer_perfil','enviar_mensaje','notas_internas','mover_embudo','handoff'];`

No hay reversión parcial del resto de `actualizaciones.sql` (fase 2): si hay que volver a un esquema anterior,
restaura el respaldo.

## 6. Advertencias

- **Orden de SQL:** nunca dejes `multi-tenant.sql` como último paso. Después de correrlo (o de cualquier
  `GRANT … ON ALL TABLES` manual), vuelve a correr `actualizaciones.sql`.
- **No uses `prisma db push` en una base con bots existentes sin haber corrido antes `actualizaciones.sql`:**
  `permisos` nace con el conjunto mínimo como valor por defecto y los bots que ya existían quedarían limitados
  y dejarían de funcionar. En producción la app no corre DDL (`crm_app`), así que esto solo aplica a bases de
  desarrollo o staging.
- **Rutas nuevas apagadas por defecto para bots existentes:** `tasks`, `appointments` (y `availability`),
  `quotes`, `products`, `opportunity` y `contacts` responden `403 permiso_faltante` hasta que el admin active
  `crear_tarea`, `agendar_cita`, `cotizar`, `ver_productos`, `editar_oportunidad` y `gestionar_contactos`.
  Un bot de producción no cambia de comportamiento al desplegar, pero tampoco "estrena" nada sin que lo actives.
- **Un solo proceso:** los límites de peticiones viven en memoria; con varias instancias del CRM el tope se multiplica.
- **Sin proxy:** si el CRM no está detrás de Cloudflare o de un proxy que fije la IP, el límite por IP es evadible.
- **Limitación conocida:** si Meta acepta un envío y falla el registro local, la ruta responde `502` (ver `api-bot.md`).

## 7. Activar tareas, citas y cotizaciones para un cliente que las contrate

Se hace por bot, cuando el cliente contrata la función y su empresa ya cumple las dependencias de la sección 0
(módulo activo, servicios y horarios cargados, plantilla aprobada si va a cotizar fuera de las 24 h).

| Función | Permiso | Además necesita |
|---|---|---|
| Crear tareas | `crear_tarea` | Un embudo configurado (la tarea cuelga de la oportunidad). |
| Consultar disponibilidad, agendar, reprogramar, confirmar y cancelar citas | `agendar_cita` | Módulos `citas` y `reservas_en_linea` con al menos un servicio, profesional y horario semanal. |
| Crear, listar y enviar cotizaciones | `cotizar` | Módulo `cotizaciones`; plantilla `plantillaCotizacion` aprobada en Meta y `wabaId` en el canal para enviar fuera de las 24 h. |

**Desde la pantalla:** Configuración → Bots → el bot del cliente → marca *Crear tareas*, *Consultar, agendar y
reprogramar citas* y/o *Crear y enviar cotizaciones*. Aplica de inmediato (los permisos se leen en cada petición).

**Por SQL** (como dueño, solo ese bot; `permisos || …` agrega sin repetir lo que ya tenía):
```sql
UPDATE bots
   SET permisos = ARRAY(SELECT DISTINCT unnest(permisos || ARRAY['agendar_cita','cotizar','crear_tarea']))
 WHERE id = <id del bot>;                                   -- ajusta la lista a lo contratado
SELECT id, nombre, permisos FROM bots WHERE id = <id del bot>;
```

**Para retirar una función:** desmarca la casilla o
`UPDATE bots SET permisos = array_remove(permisos, 'cotizar') WHERE id = <id>;`

**Verifica con el token del bot** (debe pasar de 403 a 2xx):
```bash
curl -s -o /dev/null -w "%{http_code}\n" -H "api_access_token: $TOKEN" \
  "$CRM/api/v1/accounts/1/conversations/$CONV/quotes"        # 403 → 200 al activar cotizar
```
En la bitácora, cada intento denegado queda como `permiso_denegado` con el permiso y la ruta:
```sql
SELECT created_at, despues->>'permiso' AS permiso, despues->>'ruta' AS ruta
FROM auditoria_bot WHERE accion = 'permiso_denegado' ORDER BY id DESC LIMIT 20;
```
