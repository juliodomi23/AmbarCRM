# Orden real de migración y backfills

Revisión del checkout `preparar-merge-meta`, basado en `modulos-fase-2` (`70e684b`).
No se ejecutaron Docker Compose, `prisma db push` ni comandos de despliegue.
El ensayo y la regresión se ejecutan solo en PostgreSQL 16 desechable, puerto 55450.

## Secuencia del código actual

| Situación | Orden comprobado en archivos |
|---|---|
| Volumen PostgreSQL vacío | `schema.sql` como `01-schema.sql` → `deploy/02-multitenant.sh` → `multi-tenant.sql` → `actualizaciones.sql` → contraseña del rol `crm_app`. |
| Volumen existente | PostgreSQL saludable → `db-migrate` ejecuta `psql -v ON_ERROR_STOP=1 -f /sql/actualizaciones.sql` como dueño → app puede arrancar al cumplirse `service_completed_successfully`. |
| Build de imagen | `web/Dockerfile` instala dependencias y ejecuta `prisma generate` y `npm run build`; genera cliente/compila, sin sincronizar la BD. |
| Arranque de app | El comando Compose intenta `scripts/seed-admin.mjs` si hay contraseña; luego `npm start`. El seed administra el usuario inicial; no hace DDL. La app usa `crm_app`. |
| Reinicio aislado de app | No garantiza repetir `db-migrate`. El redeploy debe ejecutar/recrear ese servicio y comprobar salida 0. |

El `prisma:push` de `web/package.json` existe como comando manual, pero no está
invocado en Compose, Dockerfile, init ni arranque. Por tanto, en este despliegue
**no hay un `db push` antes o después del SQL**. La advertencia del diagnóstico
describe un riesgo histórico; no debe convertirse en una instrucción para añadirlo.
Tampoco se usa en las pruebas: alteraría CHECKs y tipos de fecha del camino real.

## Backfills revisados

| Datos | Preparación antes del backfill | Idempotencia / conservación |
|---|---|---|
| `mensajes.canal_id` | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` en el mismo SQL. | Copia el canal de la conversación solo si es distinto; el trigger protege mensajes posteriores. |
| `conversaciones.ultimo_entrante_at` | Columna añadida antes del UPDATE. | Usa el máximo entrante no interno; solo avanza NULL/fechas anteriores. |
| `modulos_org.config.puestosPermitidos` | `CREATE TABLE IF NOT EXISTS modulos_org` antes del UPDATE. | Solo agrega la clave ausente; no pisa listas existentes, incluidas las vacías. |
| `bots.permisos` | `ADD COLUMN IF NOT EXISTS permisos TEXT[]`, inicialmente nullable. | Llena exclusivamente NULL con `leer_perfil,enviar_mensaje,notas_internas,mover_embudo,handoff`; luego DEFAULT mínimo para nuevos bots y NOT NULL. No reemplaza permisos personalizados. |
| Etiquetas de conversaciones | `contacto_etiquetas`, `conversaciones` y `etiquetas` vienen del esquema base/multi-tenant. | `SELECT DISTINCT` + `ON CONFLICT DO NOTHING`, por organización y nombre. Conserva los arrays originales. |
| Proveedores antiguos | Enum y canales ya existen en el esquema base. | Solo desactiva proveedores retirados; preserva `cloud_api`, `messenger`, `api`. El ensayo usa los canales WhatsApp vigentes. |
| Cantidades decimales | Inspección de `information_schema.columns` y ALTER de columnas existentes. | Conversión condicionada; no exige generar tablas con Prisma después. |
| Tokens WhatsApp | No hay un backfill de cifrado automático en este SQL. | `config.token`/`tokenEncrypted` se conservan byte a byte. El código prioriza cifrado y admite legacy. No retirar esa compatibilidad como parte del despliegue. |

No se encontró un backfill que necesite un `db push` posterior. No fue necesario
modificar `actualizaciones.sql`: las columnas/tablas requeridas están creadas
antes de su uso y los backfills ya son idempotentes. No envolver el archivo entero
en una transacción ni usar `psql --single-transaction`: `ALTER TYPE ... ADD VALUE`
debe confirmar sus valores antes de que las sentencias posteriores los utilicen.

La trampa inversa sigue siendo relevante: un `db push` manual previo podría llenar
`bots.permisos` con el DEFAULT de bots nuevos y hacer que el UPDATE `WHERE permisos
IS NULL` no identifique los bots históricos. El camino aprobado evita esa operación;
no se ensayó ni se autoriza ese orden alternativo. Si alguien ya lo ejecutó en una
BD real, 🛑 Julio debe revisar los permisos históricos antes de desplegar, sin
sobrescribir a ciegas permisos editados por administradores.

## Evidencia

- [Regresión completa](regresion-pre-merge-2026-10-17.md): creación SQL desde cero y
  tres aplicaciones sucesivas, además de pruebas de BD y HTTP.
- [Ensayo desde el esquema anterior](ensayo-migracion-pre-merge-2026-10-17.md):
  datos sintéticos previos, conteos/huellas y verificación de los backfills.

Esto verifica el contrato de los archivos del repo, no la configuración real de
EasyPanel ni si hay comandos de arranque externos. 🛑 En la ventana de despliegue,
Julio debe confirmar que el panel usa este Compose, sin comandos personalizados
que ejecuten `prisma db push`, y revisar los logs de `db-migrate`.
