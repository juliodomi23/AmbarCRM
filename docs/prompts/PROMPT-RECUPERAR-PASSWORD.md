# Prompt para Codex — Recuperar contraseña por correo

> Copia desde "## Prompt" y pégalo en Codex. Corrida única, una sola parada al final.
> Rama aparte: `codex/recuperar-password`, desde `meta-tech-provider` (árbol limpio).
> Corre en paralelo con trabajo de Meta/coexistencia: no toques nada de `lib/meta`, `lib/channel`, `api/meta`, `api/wa` ni `components/config`.

## Contexto verificado (confírmalo leyendo el código, no lo asumas)

- Login: NextAuth Credentials en `web/src/lib/auth.ts`; entra con **organización (slug) + correo + contraseña**
  (`orgSlug` en el formulario `web/src/app/login/page.tsx`). `usuarios` es único por `(org_id, email)`.
- Hoy no existe envío de correo en el repo (ni `nodemailer` ni otro) ni "olvidé mi contraseña". Un admin puede
  reiniciar la contraseña de otro (`PATCH /api/usuarios/[id]`); cada usuario puede cambiar la suya en
  `/perfil` (`POST /api/cuenta/password`, `PATCH /api/cuenta/perfil`).
- Multi-tenant con RLS: tablas con `org_id` y política `org_isolation`; la app corre con el rol `crm_app`
  (sin bypass). Resolver una org antes de que haya sesión usa funciones `SECURITY DEFINER`
  (ver `resolve_org_by_phone`, `resolve_org_by_instagram` en `prisma/sql/actualizaciones.sql`).
- Rate limit en memoria: `web/src/lib/rate-limit.ts` (`permitido`, `ipCliente`).
- Migraciones: **solo SQL idempotente al final de `web/prisma/sql/actualizaciones.sql`** (lo corre el servicio
  `db-migrate` del compose). No uses `prisma db push` ni dependas de su orden. Actualiza también
  `prisma/schema.prisma` para el cliente de Prisma.
- Variables de entorno: el contenedor solo recibe las que `docker-compose.yml` mapea de forma explícita en el
  servicio `app`. Si agregas una variable y no la mapeas ahí, **no llega**.
- Páginas públicas se excluyen del matcher de `web/src/proxy.ts` (lista de rutas sin login).

## Prompt

Trabajas en AmbarCRM (`docs/08-productos-internos/AmbarCRM`, código en `web/`). Parte de `meta-tech-provider`
y crea la rama `codex/recuperar-password`. **No hagas push ni deploy, no toques producción, `main` ni
ninguna base real, y no envíes correos reales ni llames a ninguna red real** (SMTP simulado en las pruebas).
Reglas del repo en `PLAN-CIERRE-FASE-2.md`: BD desechable armada con `schema.sql` + `multi-tenant.sql` +
`actualizaciones.sql`, commit por paso, mensajes en español, sin comentarios obvios, código modular y chico.

### Qué construir

Flujo "¿Olvidaste tu contraseña?" por correo, de punta a punta:

1. **Solicitar.** Página pública `/recuperar` (organización + correo) y `POST /api/auth/recuperar`.
   - Respuesta **siempre idéntica** exista o no la org/el usuario (no revela cuentas), y con tiempo parecido.
   - Solo si el usuario existe y está `activo` y la org está `activa`: crear token y enviar correo.
   - Rate limit por IP y por `org+correo` (p. ej. 5 por hora cada uno) con `lib/rate-limit.ts`.
2. **Token.** 32 bytes aleatorios (`crypto.randomBytes`), se manda en el enlace y **en la BD solo se guarda su
   SHA-256**. Vence a los **60 minutos**, de **un solo uso**. Al crear uno nuevo, los anteriores sin usar del
   mismo usuario quedan invalidados.
3. **Restablecer.** Página pública `/restablecer/[token]` y `POST /api/auth/restablecer { token, nueva }`.
   - Contraseña mínima de 8 caracteres (misma regla que `/api/cuenta/password`).
   - Comparar el hash con el de la BD, validar vencimiento y que no se haya usado; marcar usado en la misma
     transacción que cambia `passwordHash` (bcrypt, costo 10, igual que el resto).
   - Mensaje genérico para token inválido/vencido/usado.
4. **Cerrar sesiones viejas.** Agrega `usuarios.password_cambiada_at TIMESTAMPTZ` y úsalo en el callback `jwt`
   de `lib/auth.ts` (ya revalida contra la BD cada 5 min): si el token se emitió **antes** de
   `password_cambiada_at`, marca `revocado`. Actualízalo también en `POST /api/cuenta/password` y en el reinicio
   de un admin (`PATCH /api/usuarios/[id]` cuando trae `password`). Cuidado: la sesión que acaba de cambiar su
   propia contraseña en `/perfil` no debe quedar fuera (usa un margen o vuelve a emitir su token).
5. **Enlace en el login.** Agrega "¿Olvidaste tu contraseña?" en `/login`, **solo visible si el correo está
   configurado** (decide en servidor con las variables SMTP).
6. **Aviso de seguridad.** Tras restablecer, enviar un correo corto "tu contraseña fue cambiada" al usuario.

### Datos y SQL (idempotente, al final de `actualizaciones.sql`)

Tabla `restablecimientos_password`: `id`, `org_id` (con el DEFAULT por contexto como las demás), `usuario_id`
(FK `ON DELETE CASCADE`), `token_hash` (único), `vence_at`, `usado_at`, `created_at`. Con RLS `org_isolation`,
`GRANT` a `crm_app`, e índices por `token_hash` y `usuario_id`.

Antes de haber sesión no hay `app.current_org`, así que el alta y la consulta del token deben resolver la org
con **funciones `SECURITY DEFINER` mínimas** (patrón de `resolve_org_by_instagram`: `SET search_path = public`,
`REVOKE ALL ... FROM PUBLIC`, `GRANT EXECUTE ... TO crm_app`), o ejecutar con `runWithOrg(org.id, ...)` una vez
resuelta la org por slug como hace el login. Elige la opción más simple que mantenga el aislamiento y explica
por qué. Nada de dar `BYPASSRLS` a `crm_app`.

Agrega `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_cambiada_at TIMESTAMPTZ;`.

### Correo

- Dependencia nueva permitida: `nodemailer` (única). Módulo pequeño `web/src/lib/correo.ts` con
  `correoConfigurado()` y `enviarCorreo({ para, asunto, texto, html })`.
- Variables: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` (`true`/`false`), `SMTP_USER`, `SMTP_PASSWORD`,
  `SMTP_FROM` (p. ej. `AmbarCRM <no-reply@ambarrojostudios.cloud>`). **Mapéalas en el servicio `app` de
  `docker-compose.yml`** (sin valores por defecto para los secretos) y agrégalas a `.env.example`,
  `web/.env.example` y `DESPLIEGUE.md` (tabla de variables).
- Sin SMTP configurado: la función no envía, el flujo responde genérico, el enlace del login no aparece y se
  deja una línea de log sin datos sensibles.
- **Nunca** registrar el token, el enlace completo ni la contraseña en logs, ni siquiera en desarrollo.
- El enlace usa `NEXTAUTH_URL` como base (`${NEXTAUTH_URL}/restablecer/<token>`), igual que
  `enlacePublicoCotizacion`. Plantilla en español, sencilla, con la marca de la org si es fácil de leer
  (`lib/brand.ts`), y texto plano además de HTML.

### Seguridad que debes cumplir y probar

- No se revela si la org o el correo existen (misma respuesta y estado HTTP).
- El token sin hash nunca toca la BD ni los logs.
- Un token solo funciona una vez y vence; reutilizarlo falla.
- Usuario inactivo u org inactiva: no se envía nada.
- Un token de una org no puede cambiar la contraseña de usuarios de otra (RLS).
- Cambiar la contraseña cierra sesiones emitidas antes (punto 4), sin sacar a quien acaba de cambiarla.
- Agrega las rutas públicas nuevas (`recuperar`, `restablecer`, `api/auth/recuperar`, `api/auth/restablecer`)
  al matcher de `proxy.ts` y confirma con `scripts/check-proxy.ts` que el resto sigue protegido.

### Pruebas

Un script `scripts/check-recuperar-password.ts` con el patrón de los `check-*.ts` existentes, contra la BD
desechable y con el transporte de correo simulado: flujo feliz completo, token reutilizado, token vencido,
usuario inexistente (misma respuesta), usuario/org inactivo, rate limit, aislamiento entre orgs, y revocación
de sesiones por `password_cambiada_at`. Corre además `npx tsc --noEmit`, `npx eslint` de lo tocado,
`scripts/check-proxy.ts` y `next build`. Si algo falla, corrígelo antes de seguir.

### Fuera de alcance (no lo hagas)

Verificar correos al registrarse, 2FA, "iniciar sesión con Google", plantillas de correo para otros usos,
cola de reintentos de correo, tocar Meta/WhatsApp/canales, o cambiar el formulario de `/perfil` más allá de
llamar a la actualización de `password_cambiada_at`.

### Entrega

Un commit por paso, rama `codex/recuperar-password` sin push. Al final, un resumen corto con: qué quedó,
resultado de cada comando de verificación, decisiones que tomaste (sobre todo la de RLS y la de revocar
sesiones), y qué variables SMTP hay que cargar en EasyPanel antes de desplegar.
