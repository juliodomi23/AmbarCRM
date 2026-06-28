# AmbarCRM — Multi-tenant (BD compartida + org_id + RLS)

> Un solo deploy y un solo Postgres sirviendo a **muchos clientes (orgs)**, con
> aislamiento garantizado por **Row-Level Security**. Habilita el modelo **Tech Provider
> de Meta**: onboardeas el WhatsApp de cada cliente desde un panel central, sin un deploy
> por cliente. **Ya implementado en código** — esta guía es para desplegarlo y validarlo.

## Cómo funciona (la idea que evita reescribir las 56 rutas)

1. Cada tabla lleva `org_id`. Su **DEFAULT lo pone Postgres** leyendo el tenant del
   contexto: `NULLIF(current_setting('app.current_org', true), '')::bigint`. Por eso los
   `.create()` existentes **no cambian**: el `org_id` se autollena.
2. Antes de cada query, el cliente Prisma (`src/lib/db.ts`) hace `set_config('app.current_org', …)`
   dentro de la misma transacción. **RLS** filtra lecturas y valida escrituras.
3. El tenant se resuelve solo: de un contexto explícito (`runWithOrg`/`setOrg`) o de la sesión.

⚠️ **RLS no cruza foreign keys** → `org_id` va en *todas* las tablas (ya está en el schema).
⚠️ **La app debe conectarse como `crm_app`** (rol sin BYPASSRLS), nunca como el dueño/superusuario,
o RLS se ignora y NO hay aislamiento.

---

## Archivos que cambiaron / se crearon

| Archivo | Qué hace |
|---------|----------|
| `prisma/schema.prisma` | `model Org` + `orgId` en cada tabla + uniques compuestas (`[orgId, email]`, etc.) |
| `prisma/sql/multi-tenant.sql` | Migración: backfill, RLS, rol `crm_app`, funciones de resolución |
| `prisma/scripts/test-aislamiento.ts` | Check ejecutable: falla si hay fuga entre tenants |
| `src/lib/db.ts` | Cliente con contexto de tenant (`runWithOrg`, `setOrg`, `dbRaw`) + extensión RLS |
| `src/lib/auth.ts` | Resuelve la org por subdominio/slug; `orgId` en la sesión |
| `src/lib/session.ts`, `types/next-auth.d.ts` | Exponen `orgId` |
| `src/lib/bot-auth.ts` | Resuelve la org por el token del bot (función SECURITY DEFINER) |
| `src/app/api/wa/webhook/route.ts` | Resuelve la org por `phone_number_id` (Meta) o `?canal=` |
| `src/app/api/cron/auto-resolver/route.ts` | Itera todos los tenants |
| `src/app/api/orgs/route.ts` | **Nuevo**: alta de cliente (org + admin + ajustes) |
| `src/app/api/wa/onboard/route.ts` | **Nuevo**: cierre del Embedded Signup (Tech Provider) |
| `src/lib/channel/cloudapi.ts` | Factory por canal: credenciales Cloud API por-org + media por `media_id` |
| `src/components/config/EmbeddedSignup.tsx` | **Nuevo**: botón "Conectar WhatsApp Oficial" (Embedded Signup) |

Las ~50 rutas/servicios autenticados restantes **no se tocaron**: heredan el tenant de la sesión.

---

## Despliegue

**Deploy limpio (BD vacía) — automático:** al primer arranque del contenedor `db`, Postgres
corre su init (volumen vacío) en orden:
1. `schema.sql` → crea las tablas base.
2. `deploy/02-multitenant.sh` → aplica `prisma/sql/multi-tenant.sql` (PARTE A→B→C: `org_id`,
   RLS, funciones, rol `crm_app`) y le pone la contraseña de `CRM_APP_PASSWORD`.

No hay pasos manuales en la BD. Solo define en el entorno:
- `POSTGRES_USER/PASSWORD/DB` → rol **dueño** (solo init/migra, la app no lo usa).
- `CRM_APP_PASSWORD` → contraseña del rol **`crm_app`** con el que corre la app (solo
  letras/números: va dentro de `DATABASE_URL`). El compose ya arma `DATABASE_URL=crm_app`.

Tras el primer boot, crea el admin real (corre bajo `crm_app`, ya es RLS-aware, org 1):
```bash
docker compose exec app node scripts/seed-admin.mjs "Admin" admin@tudominio.com "ClaveFuerte"
```

**BD existente (con datos) — manual una vez:** corre `prisma/sql/multi-tenant.sql`
(PARTE A→B→C) con el rol dueño, pon `CRM_APP_PASSWORD`/`DATABASE_URL=crm_app` y redeploya.
El init de arriba NO se dispara si el volumen ya tiene datos.

**En todos los casos:**
- `DATABASE_URL` → usuario **`crm_app`** (no el dueño), o RLS se ignora y no hay aislamiento.
- ⚠️ El contenedor de la app ya NO corre `prisma db push` al arrancar (es `crm_app`, sin DDL).
- Define en el entorno: `DEFAULT_ORG_SLUG=inicial` (dev/dominio único). En prod multi-cliente,
  resuelve por subdominio (`cliente.tucrm.com`); si tu dominio base tiene una etiqueta fija,
  ponla en `BASE_DOMAIN_FIRST_LABEL`.

**Validar (obligatorio antes de prod):**
```bash
npx prisma validate
npm run build
DATABASE_URL=<url-de-crm_app> npx tsx prisma/scripts/test-aislamiento.ts   # debe imprimir OK
```

---

## Onboarding de un cliente

`POST /api/orgs` (admin de la org plataforma, id=1):
```json
{ "nombre": "Clínica X", "slug": "clinica-x",
  "adminNombre": "Dueño", "adminEmail": "dueno@clinicax.com", "adminPassword": "…" }
```
Crea la org, su usuario admin y su fila de `ajustes`. El cliente entra por `clinica-x.tucrm.com`.

---

## Tech Provider / Embedded Signup (backend YA implementado)

Lo hecho en código:
- `cloudApiProvider` ahora es **factory por canal** (`makeCloudApiProvider(config)`): lee
  `token`/`phoneNumberId` de `canales_whatsapp.config` (fallback a env). Los 6 sitios de
  envío le pasan `canal.config`.
- **Descarga de media por `media_id`** (`descargarMedia`): pide la URL temporal y la baja
  autenticada con el token del canal.
- `POST /api/wa/onboard`: canjea el `code` del Embedded Signup → token del cliente, suscribe
  su WABA (`/{wabaId}/subscribed_apps`) y crea el canal `cloud_api` en la org de la sesión.
- El webhook ya enruta por `phone_number_id` (`resolve_org_by_phone`) → cae en la org correcta.

**Botón frontend YA implementado**: `src/components/config/EmbeddedSignup.tsx`, montado en
Configuración → Canal WhatsApp. Carga el SDK de Meta, lanza `FB.login` con tu `config_id`,
captura el evento WA_EMBEDDED_SIGNUP y llama a `/api/wa/onboard`. Si faltan las env vars,
muestra un aviso en vez del botón (no rompe la UI).

**Env vars nuevas** (en `.env.example`):
- `META_APP_ID`, `META_APP_SECRET` — solo servidor (canje del `code`).
- `NEXT_PUBLIC_META_APP_ID` — frontend, `FB.init`.
- `NEXT_PUBLIC_META_CONFIG_ID` — config_id del Embedded Signup (Tech Provider + **coexistencia**).

> Todo esto solo **funciona tras la aprobación de Meta** (verificación de negocio + App Review),
> que tarda semanas. El código ya está listo: en cuanto pongas las env vars, el botón opera.

**Pendiente menor:** registrar templates aprobados por Meta para enviar fuera de la ventana
de 24h (hoy se envía texto libre, que Meta solo permite dentro de la sesión de 24h).

---

## Límites conocidos (verificar en local)

- **Nested creates** (crear con relaciones anidadas en un solo `.create`): los hijos toman
  `org_id` del mismo DEFAULT por contexto, así que funcionan; aun así, revísalos en el test.
- **`setOrg` (enterWith)** fija el tenant para el resto del request en bots. Si algún día
  corres lógica de bots fuera de un handler por-request, usa `runWithOrg` explícito.
- **`orgs` no tiene RLS** (sus slugs no son sensibles). No expongas un listado de orgs a tenants.
</content>
