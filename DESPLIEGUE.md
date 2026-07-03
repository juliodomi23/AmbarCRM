# AmbarCRM — Despliegue

> Resumen: un solo deploy + un Postgres sirven a varios clientes (multi-tenant con RLS).
> En **BD limpia, el esquema y la migración multi-tenant se aplican solos** en el primer
> arranque de Postgres. La app corre como el rol `crm_app` (con aislamiento RLS), nunca
> como el dueño.

---

## A) Desplegar en EasyPanel (producción) — paso a paso

### 1. Variables de entorno
En el servicio, pon estas (genera secretos con `openssl rand -base64 32`):

| Variable | Qué es |
|----------|--------|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Rol **dueño** de Postgres. Solo se usa para el init/migraciones. La app NO lo usa. |
| `CRM_APP_PASSWORD` | Contraseña del rol **`crm_app`** con el que corre la app. **Solo letras y números** (va dentro de `DATABASE_URL`). |
| `NEXTAUTH_URL` | El dominio EXACTO del servicio `app`, sin slash final (`https://crm.tudominio.com`). |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` |
| `WA_API_KEY` | Clave larga para que n8n llame al webhook. |
| `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` / `EVOLUTION_INSTANCE` | Evolution API (envío de WhatsApp). |
| `ANTHROPIC_API_KEY` | Opcional (sugerencias de IA en el chat). |

> El `DATABASE_URL` NO se pone a mano: el `docker-compose.yml` lo arma con `crm_app` + `CRM_APP_PASSWORD`.

### 2. Deploy
1. Sube `AmbarCRM/` como repo (o pega el `docker-compose.yml` como servicio Compose).
2. **Deploy.** En el primer arranque, Postgres corre su init en orden:
   - `schema.sql` → crea las tablas.
   - `deploy/02-multitenant.sh` → aplica `org_id` + RLS + funciones + crea el rol `crm_app`.
3. Asigna un **dominio** al servicio `app` → **puerto 3000** (EasyPanel pone el HTTPS).
4. Confirma que `NEXTAUTH_URL` sea ese dominio exacto. *(Si apunta a un dominio viejo, el nuevo
   da "Service is not reachable" aunque el contenedor esté sano — revisa esto primero.)*

### 3. Crear el admin real
El `schema.sql` siembra un admin de ejemplo que **no** sirve para entrar. Crea uno real
**dentro del contenedor `app`** (no el `db`, que no tiene Node):
```bash
docker compose exec app node scripts/seed-admin.mjs "Admin" admin@tudominio.com "ClaveFuerte"
```
Por SSH: `docker ps` → ubica el contenedor de `app` → `docker exec -it <id> sh` → adentro
corre `node scripts/seed-admin.mjs ...`. Entra en `/login` con ese correo y contraseña.

---

## ⚠️ Si vas a RECREAR el proyecto desde cero (BD limpia)

El init automático **solo corre con el volumen de Postgres vacío**. Si el volumen viejo
sobrevive, el init NO se dispara y la app arranca sin las columnas `org_id` → las queries fallan.

**Orden correcto:**
1. Elimina el servicio **y su volumen `pgdata`** (en EasyPanel: borra el volumen de la BD, no
   solo el servicio).
2. Asegúrate de tener `CRM_APP_PASSWORD` en las variables (paso A.1).
3. Deploy → se aplica todo solo.
4. Crea el admin (paso A.3).

---

## B) BD que YA tiene datos (migración manual, una sola vez)

Si NO borras el volumen y ya hay datos de un cliente, el init no corre: aplica la migración a mano.
```bash
DB=$(docker ps --format '{{.Names}}' | grep -i db | head -1)
APP=$(docker ps --format '{{.Names}}' | grep -iE 'app|ambarcrm' | grep -vi db | head -1)

# backup primero
docker exec -t "$DB" pg_dump -U ambarcrm ambarcrm | gzip > ~/ambarcrm_$(date +%F).sql.gz

# aplica la migración como dueño y fija la clave de crm_app
docker exec "$APP" cat /app/prisma/sql/multi-tenant.sql \
  | docker exec -i "$DB" psql -U ambarcrm -d ambarcrm -v ON_ERROR_STOP=1
docker exec -i "$DB" psql -U ambarcrm -d ambarcrm \
  -c "ALTER ROLE crm_app WITH PASSWORD 'LaMismaDeCRM_APP_PASSWORD';"
```
Luego pon `CRM_APP_PASSWORD` en las variables y redeploya (la app pasa a `crm_app`).

**Si tu BD se migró ANTES de 2026-07-03** (trigger de realtime sin `org_id`), corre además este bloque una vez (está al final de `multi-tenant.sql`, PARTE D):
```sql
CREATE OR REPLACE FUNCTION fn_notify_mensaje() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('nuevo_mensaje', json_build_object(
    'conversacion_id', NEW.conversacion_id,
    'mensaje_id',      NEW.id,
    'direccion',       NEW.direccion,
    'org_id',          NEW.org_id
  )::text);
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
```
Sin esto el chat sigue funcionando (el SSE reenvía los eventos viejos tal cual), pero el filtro por organización solo aplica con el trigger nuevo.

---

## C) Onboarding de un cliente nuevo (multi-tenant)

Con un admin de la org plataforma (id=1), `POST /api/orgs`:
```json
{ "nombre": "Clínica X", "slug": "clinica-x",
  "adminNombre": "Dueño", "adminEmail": "dueno@clinicax.com", "adminPassword": "…" }
```
Crea la org, su admin y sus ajustes. El cliente entra por `clinica-x.tucrm.com`.
Detalle de multi-tenant y Tech Provider de Meta: ver `MULTI-TENANT.md`.

---

## D) Conectar WhatsApp (n8n + Evolution)

Ver `INTEGRACION-N8N.md`. Resumen:
- **Recibir**: Evolution → n8n → `POST https://crm.tudominio.com/api/wa/webhook?canal=1`
  con header `x-api-key: <WA_API_KEY>`.
- **Enviar**: lo hace el CRM (variables `EVOLUTION_*`).
- En **Configuración → Canal WhatsApp** ajusta nombre/teléfono/instancia y estado.

---

## E) Backups (imprescindible antes de entregar a cliente)

- **EasyPanel**: servicio `db` → pestaña **Backups** → activa backups diarios a S3/local. (Lo más simple.)
- **`pg_dump` por cron** (alternativa):
  ```bash
  docker compose exec -T db pg_dump -U ambarcrm ambarcrm | gzip > /backups/ambarcrm_$(date +%F).sql.gz
  ```
  Rota a 7–30 días. **Prueba restaurar** un dump al menos una vez: un backup sin restore probado no es backup.

---

## F) Correr en local (para probar)

```bash
cd AmbarCRM
cp .env.example .env        # edita POSTGRES_*, CRM_APP_PASSWORD y el resto
docker compose up -d --build
docker compose exec app node scripts/seed-admin.mjs "Tu Nombre" admin@local.mx "TuContraseña"
```
App en http://localhost:3000 (puerto expuesto solo si lo agregas; en EasyPanel va por dominio).

---

## Notas
- El chat en vivo usa **SSE** (`/api/stream`) sobre `LISTEN/NOTIFY` de Postgres; funciona
  detrás del proxy de EasyPanel sin configuración extra.
- La app NO corre `prisma db push` al arrancar (es `crm_app`, sin permisos DDL). Cualquier
  cambio de esquema futuro se aplica con el rol dueño antes de redeployar.
