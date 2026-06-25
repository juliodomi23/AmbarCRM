# AmbarCRM — Despliegue

## A) Correr en local (para probar)

Requisitos: Docker Desktop **o** Node 22 + un Postgres local.

### Opción rápida con Docker (todo junto)
```bash
cd AmbarCRM
cp .env.example .env        # edita las claves
docker compose up -d --build
```
- App en http://localhost:3000
- La primera vez, Postgres crea las tablas desde `schema.sql` automáticamente.

### Crear el usuario admin (con contraseña real)
El `schema.sql` siembra un admin con un hash de ejemplo que **no** sirve para entrar.
Crea uno real ejecutando el seed dentro del contenedor de la app:
```bash
docker compose exec app node scripts/seed-admin.mjs "Tu Nombre" admin@tudominio.com "TuContraseña"
```
Entra en http://localhost:3000/login con ese correo y contraseña.

### Opción sin Docker (solo la app, BD aparte)
```bash
cd AmbarCRM/web
cp .env.example .env        # apunta DATABASE_URL a tu Postgres
npm install
npx prisma db push          # crea tablas desde schema.prisma
npm run seed:admin -- "Tu Nombre" admin@tudominio.com "TuContraseña"
npm run dev
```

---

## B) Desplegar en EasyPanel (VPS)

Mismo patrón que GestorLegal.

1. **Sube `AmbarCRM/` como repo** (o como Compose pegando el `docker-compose.yml`).
2. En EasyPanel crea un servicio tipo **Compose** apuntando a este proyecto.
3. En **Environment**, pon las variables del `.env.example` (genera `NEXTAUTH_SECRET` con
   `openssl rand -base64 32` y una `WA_API_KEY` larga).
4. **Deploy.** Postgres crea el esquema en el primer arranque.
5. Asigna un **dominio** al servicio `app` → puerto **3000** (EasyPanel pone el HTTPS).
6. Pon ese dominio en `NEXTAUTH_URL` **exacto** (`https://tu-dominio.easypanel.host`, sin slash final).
   Si `NEXTAUTH_URL` apunta a otro dominio viejo, el dominio nuevo da "Service is not reachable"
   aunque el contenedor esté sano — revisa esto primero si el dominio no abre.
7. Crea el admin real, **dentro del contenedor `app`** (no del contenedor `db`, ese es Postgres y no
   tiene Node — da error `node: command not found`):
   ```bash
   docker compose exec app node scripts/seed-admin.mjs "Admin" admin@tudominio.com "ClaveFuerte"
   ```
   Si entras por la terminal de EasyPanel, asegúrate de seleccionar el servicio `app` (no `db`) antes
   de abrir la shell. Por SSH al VPS: `docker ps` para ubicar el contenedor de `app`, luego
   `docker exec -it <id> sh` y ya adentro corre solo `node scripts/seed-admin.mjs ...`.

> **Backups y migraciones**: ver sección **D** antes de entregar a cliente.

---

## C) Conectar WhatsApp (n8n + Evolution)

Ver `INTEGRACION-N8N.md`. Resumen:
- **Recibir**: Evolution → n8n → `POST https://crm.tudominio.com/api/wa/webhook?canal=1`
  con header `x-api-key: <WA_API_KEY>`.
- **Enviar**: lo hace el CRM solo (variables `EVOLUTION_*`).
- En **Configuración → Canal WhatsApp** ajusta nombre/teléfono/instancia y el estado.

---

## D) Base de datos: migraciones y backups (producción)

### Migraciones (pasar de `db push` a `migrate deploy`)
Hoy el Dockerfile corre `prisma db push` en cada arranque: práctico, pero ante un cambio de
esquema no aditivo puede **fallar el arranque o perder datos**, y no deja historial. Para producción
con datos de cliente conviene usar migraciones versionadas. Ya está preparada la migración base en
`web/prisma/migrations/0_init/`.

**Cutover (se hace UNA sola vez, con la BD de prod ya creada por `db push`):**
1. Marca la migración base como ya aplicada (no la re-ejecuta, solo la registra), **dentro del contenedor `app`**:
   ```bash
   docker compose exec app npx prisma migrate resolve --applied 0_init
   ```
2. Cambia el `CMD` del `web/Dockerfile` de:
   ```
   CMD npx prisma db push --skip-generate && npm start
   ```
   a:
   ```
   CMD npx prisma migrate deploy && npm start
   ```
3. Redespliega. A partir de aquí, **cada cambio de esquema** se hace en local con
   `npx prisma migrate dev --name <descripcion>` (genera el SQL en `prisma/migrations/`), se commitea,
   y al desplegar `migrate deploy` lo aplica solo.

> ⚠️ No cambies el Dockerfile a `migrate deploy` **sin** hacer antes el paso 1 en prod: el deploy
> intentaría crear tablas que ya existen y fallaría. Mientras no hagas el cutover, `db push` sigue
> funcionando como hasta ahora.

### Backups de Postgres (EasyPanel)
Imprescindible antes de entregar a cliente. Opciones:
- **Snapshots de EasyPanel**: en el servicio `db` → pestaña **Backups**, activa backups programados
  (diarios) hacia un destino S3/local. Es lo más simple.
- **`pg_dump` por cron** (alternativa): un cron diario que corra
  ```bash
  docker compose exec -T db pg_dump -U <usuario> <bd> | gzip > /backups/ambarcrm_$(date +%F).sql.gz
  ```
  y rotar a 7–30 días. Prueba **restaurar** un dump al menos una vez: un backup sin restore probado no es backup.

---

## Notas
- El chat en vivo usa **SSE** (`/api/stream`) sobre una conexión Postgres `LISTEN/NOTIFY`;
  funciona detrás del proxy de EasyPanel sin configuración extra.
- Para migrar a **coexistencia oficial de Meta**: cambia el canal a `proveedor=cloud_api`,
  llena `CLOUD_API_*` y apunta el webhook de Meta a `/api/wa/webhook?canal=<id>`. Nada más cambia.
