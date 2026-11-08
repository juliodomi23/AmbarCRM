# Prompt para Codex — Fase 3: Google Calendar bidireccional (P0)

> Copia todo este archivo en Codex. Basado en el molde de `PROMPT-P0-CODEX.md`.
> El plan completo está en `PLAN-P0-COMPETITIVIDAD.md`, sección 7 (Fase 3).

---

## FASE A EJECUTAR

**Fase 3 — Google Calendar bidireccional.**

No avances a la Fase 2B (CFDI con PAC real, suspendida), ni a email, integraciones, Meta Ads, automatizaciones o reportes en esta ejecución. **No toques pagos/OAuth de pagos/Fase 1.3 ni el código CFDI existente.** Al terminar, detente y entrega evidencia para revisión.

---

## Rol

Eres un ingeniero senior full-stack trabajando en **AmbarCRM**, un CRM multiempresa para PYMEs de Latinoamérica, con WhatsApp como canal principal y módulos por giro.

Stack: Next.js 16 (App Router), TypeScript, React 19, Prisma, PostgreSQL 16, Tailwind, NextAuth. Multi-tenant con `org_id` y RLS.

Julio solo revisa. Tú haces la implementación completa, las pruebas y la evidencia.

---

## Lectura obligatoria antes de tocar código

1. `PLAN-P0-COMPETITIVIDAD.md` (sección 7, Fase 3).
2. `MULTI-TENANT.md`.
3. `web/src/lib/db.ts` (Prisma extendido, `runWithOrg`, `dbRaw`).
4. `web/prisma/schema.prisma` → modelo `Cita` (y `Doctor`/responsables).
5. `web/prisma/sql/multi-tenant.sql` y `web/prisma/sql/actualizaciones.sql` (molde de SQL idempotente + RLS).
6. `web/src/lib/pagos/oauth.ts` y rutas `web/src/app/api/pagos/oauth/*` — **solo para copiar el patrón de OAuth por organización con state/PKCE**; no los modifiques.
7. `web/src/lib/cfdi/` — patrón de interfaz `Proveedor*`, `ErrorCfdi`, validaciones, y reclamo atómico de estado.
8. `web/src/components/config/EmbeddedSignup.tsx` — patrón de "si faltan env vars, muestra aviso en vez del botón".
9. `web/src/components/ui.tsx`, `EncabezadoPagina`, `PanelListado`, `FormularioModulo`, `Boton`, `Badge`, `surface`.
10. `web/prisma/scripts/test-cfdi-e2e.ts` y `web/scripts/check-cfdi.ts` — estilo de pruebas y de base desechable `cfdi_test`.

Si el plan y el código se contradicen, gana el código; anota la diferencia en la entrega.

---

## Reglas no negociables

- Crea y cámbiate a una rama nueva desde el estado actual del working tree: `codex/p0-fase-3-calendario`.
- **No hagas push, merge ni deploy.** No toques producción, ni bases de datos reales, ni cuentas de clientes.
- **No inventes credenciales de Google.** Las credenciales llegan por variables de entorno puestas por Julio (`GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`). Si faltan, el flujo se construye igual y la UI muestra aviso (patrón `EmbeddedSignup`).
- No agregues dependencias nuevas. La API de Google se llama con `fetch` (REST/JSON); NO instales `googleapis` ni `google-auth-library`.
- Toda tabla nueva lleva `org_id` con el mismo DEFAULT del repo, FK a `orgs`, índices y política RLS `org_isolation` con `USING` y `WITH CHECK`.
- FKs compuestas `(tabla_id, org_id)` donde se cruce con otras tablas del CRM, igual que en CFDI.
- Toda lectura/escritura pasa por el patrón existente (`db` extendido, `runWithOrg`, `requireModuloActivo`).
- Tokens OAuth de Google cifrados en la BD con el mismo mecanismo usado para los tokens de pagos; nunca en texto plano ni en logs.
- Jamás registres payloads con PII, tokens ni secretos en logs.
- No rompas checks existentes (`tsc --noEmit`, ESLint, `check:cfdi`, pruebas vigentes). Si uno falla por tu cambio, corrígelo.
- No dejes TODOs sin documentar; lo que falte va en "Pendientes" con motivo.
- Zona horaria: la del ambiente del CRM por organización; nunca la del servidor.

---

## Objetivo de la Fase 3

Sincronizar **citas ↔ Google Calendar** de forma bidireccional y real (no solo mock): crear/editar/cancelar en el CRM se refleja en Calendar, y crear/editar/cancelar en Calendar se refleja en el CRM. Sin duplicar eventos y sin perder cambios.

### Reglas de sync (decisión de Julio, obligatorias)

1. **Bidireccional sin lado dominante:** si la cita cambió en el CRM, se actualiza en Calendar; si cambió en Calendar, se actualiza en el CRM.
2. **Conflicto (cambió en ambos lados entre dos syncs):** gana la versión con fecha de modificación más reciente, comparando `updated_at` de la cita contra `updated` del evento de Google. El conflicto se registra como evento en una bitácora de sync (tabla de eventos o logs en `eventos_calendario`) para que Julio lo audite; nunca se pierde silenciosamente un cambio.
3. Cada cita del CRM dentro de un evento se marca en Google con una propiedad extendida (`extendedProperties.private` con algo como `ambarcrm_cita_id`) para no reimportar eventos propios.
4. Evento borrado en Calendar → cita se cancela (se usa el estado existente `EstadoCita.cancelada` o equivalente, con motivo) y se registra el evento. Cita cancelada en CRM → evento se borra en Calendar.
5. Un evento de Calendar ajeno (hecho por alguien fuera de la relación) se importa como **cita nueva** con `origen = "calendar"`. Sin bucles: la importación marca el evento con extended property y el push posterior al CRM no re-empuja el mismo cambio.

---

### 1. Diseño

Antes de codificar, escribe un ADR corto en `docs/calendario.md`:

- Interfaz `ProveedorCalendario` como frontera (patrón de `ProveedorFactura` y `ProveedorPago`).
- Dos implementaciones: `ProveedorGoogleCalendar` (real, con OAuth) y `ProveedorCalendarioMock` (sin red, para pruebas E2E automatizadas).
- Selección por configuración del módulo/entorno; el mock solo para pruebas (`CALENDARIO_PERMITIR_MOCK=1`), bloqueado fuera.
- Flujo: OAuth por organización → push de citas → sync incremental con `syncToken` → conflictos LWW → bitácora.
- Modelo de datos, riesgos de idempotencia/concurrencia y variables de entorno.

### 2. Modelo de datos

Tablas nuevas con RLS y restricciones estrictas. Nombres de slug de columnas consistentes con el repo:

- `calendarios_conectados`: `id`, `org_id`, `usuario_crm_id` (nullable, para futuro), `proveedor`, `cuenta_google` (correo de la cuenta), `calendar_id` (por defecto `primary`), tokens **cifrados** (`access_token`, `refresh_token`), `token_expira_at`, `sync_token` (para incremental), `sincronizado_at`, `estado` (`activa`, `requiere_reconectar`, `revocada`), `timezone` (default configurable), timestamps.
  - `UNIQUE (org_id, calendar_id)`: una conexión activa por organización y calendario en esta fase. Guardar solo UNA conexión activa por org (si hay más filas, la UI lo aclara; por ahora basta org-level).
- `eventos_calendario`: `id`, `org_id`, `cita_id`, `calendario_id` (FK a `calendarios_conectados`), `evento_externo` (id de Google), `etag`, `estado` (`creado`, `actualizado`, `cancelado`, `eliminado`, `conflicto`), `ultimo_sync`, timestamps.
  - `UNIQUE (org_id, calendario_id, evento_externo)` y política RLS.
  - Al crear/actualizar cita: upsert idempotente.
- Reutiliza el patrón del CFDI para la tabla de eventos/bitácora si necesitas una (opcional).

Aplica el mismo DEFAULT de `org_id` de las demás tablas y ensaya el SQL idempotente desde `schema.sql` + `multi-tenant.sql` + `actualizaciones.sql` en Postgres desechable (mismo método que CFDI).

### 3. OAuth real (Google Calendar)

- Rutas de servidor (sin nueva lib):
  - `GET /api/calendario/oauth/iniciar`: valida sesión + módulo + permisos, genera `state` ligado a la organización (con firma o almacenamiento temporal), redirige a cuentas.google.com con los scopes mínimos:
    - `https://www.googleapis.com/auth/calendar.events`
    - `https://www.googleapis.com/auth/calendar.readonly`
  - `GET /api/calendario/oauth/callback`: valida `state` + `error` + código, cambia `code` → `access_token`/`refresh_token` contra `oauth2.googleapis.com/token`, obtiene el correo de la cuenta vía `oauth2.googleapis.com/userinfo` o `id_token`, cifra tokens, guarda la conexión activa y obtiene el primer `sync_token` con una sync incremental inicial.
- Copia el patrón de `pagos/oauth` solo en la forma (state, manejo de errores, flujos), **no** reutilices el código de pagos ni lo toques: el OAuth de Calendar es independiente con sus propias variables.
- URL de redirección esperada (documentar en `.env.example`): `CALENDARIO_OAUTH_REDIRECT_BASE` o equivalente, default `http://localhost:3000/api/calendario/oauth/callback`.
- Si `GOOGLE_CALENDAR_CLIENT_ID`/`SECRET` faltan: la API responde claramente y la UI muestra aviso en vez del botón, sin romper la página (patrón `EmbeddedSignup`).
- Refresh de token: si access token expira (`token_expira_at < now()`), refresca, guarda y marca reconectar si el refresh falla.

### 4. Push (CRM → Calendar)

- Al crear/actualizar/cancelar una cita (hook o servicio en la lógica existente de la cita, sin duplicar lógica):
  - Si la org tiene conexión activa, crea/actualiza/borra el evento en Google usando los metadatos de la cita (título, inicio/fin con timezone, notas, propiedad extendida).
  - Persistir el mapeo en `eventos_calendario` con upsert idempotente.
  - Si Google falla (token expirado, rate limit, red) la cita NO debe quedar rota: registra error en `eventos_calendario`/bitácora con reintentos y continúa. No rompas el flujo de guardar cita.
  - No sincronices citas cuyo `origen` ya es `calendar` hacia la misma conexión en un bucle: el upsert con extended property evita rebotes.
- Actualizar cita y evento de Calendar de forma lo más atómica posible; si el push falla, la cita queda localmente correcta y el evento queda como pendiente de re-push (reintento del cron).

### 5. Pull (Calendar → CRM)

- Sync incremental con `events.list` + `syncToken` (método patrón de Google Calendar v3):
  - Cron existente (mismo estilo que el cron de pagos o cron de cita) o endpoint `POST /api/calendario/sync` (llamado manualmente desde UI y/o cron).
  - Procesa `deleted` (cancelar la cita) y cambios de título/hora/notas con la regla de conflicto LWW del punto "Reglas de sync".
  - Eventos nuevos ajenos al CRM (sin extended property) → crear cita con `origen = "calendar"`, contacto genérico si no existe vínculo, y **crear el mapeo evento↔cita en `eventos_calendario`**.
  - Navegar paginación con `pageToken`.
  - Token expirado/inválido (`410 gone` de syncToken) → full resync visible en UI + log claro, no silencioso.
- Si dos sync corren concurrentes: reclamo atómico estilo CFDI (columna `sincronizando_at` o reclamo por `UPDATE ... WHERE` con TTL) para que dos runs no dupliquen citas.
- Importante: no crear citas duplicadas de Calendar → CRM: unicidad por `UNIQUE (org_id, calendario_id, evento_externo)`.

### 6. UI

- Página de Configuración o módulo `calendario` con:
  - Botón "Conectar con Google" (o aviso si faltan variables de entorno).
  - Estado de conexión con `Badge` (activa, requiere reconectar, revocada), cuenta conectada, calendario elegido, última sync y zona horaria.
  - Botón "Sincronizar ahora" y botón "Desconectar" con confirmación.
  - Errores de sync visibles, no silenciosos.
- En la ficha/agenda de citas (siguiendo el estilo `EncabezadoPagina`/`PanelListado` del repo): indicador por cita que ya tiene evento de Calendar (ícono o `Badge` discreto); no invasivo.
- UI consistente con `surface`, modo oscuro, móvil y accesibilidad.

### 7. Permisos y activación

- Módulo `calendario` o configuración equivalente en `modulos_org`, activado por organización, desactivado por defecto en seeds/demos existentes.
- Conectar/desconectar solo admin (mismo permiso que configurar emisor/facturación).
- "Sincronizar ahora" disponible para admin o usuario con agenda habilitada; el pull del cron corre a nivel sistema sin usuario en sesión (misma idea que el cron de pagos).

### 8. Pruebas mínimas obligatorias

Con `ProveedorCalendarioMock` (sin red) y base desechable tipo `cfdi_test`:

- Crear cita con conexión activa → evento creado (upsert, idempotente; dos creados igual no duplican).
- Contestar la cita en CRM → evento actualizado en Calendar.
- Cita cancelada/eliminada en CRM → evento eliminado en Calendar.
- Cambio en Calendar (update) → cambia la cita con LWW y registro de conflicto.
- Cambio en ambos lados entre syncs → gana el más reciente y queda log del conflicto.
- Evento borrado en Calendar → cita cancelada.
- Evento externo en Calendar → cita nueva con `origen = "calendar"` y mapeo `eventos_calendario` sin duplicados.
- `syncToken` inválido/expirado → full resync controlado, sin duplicar citas.
- Token expirado → refresh automático; refresh fallido → estado `requiere_reconectar`.
- Dos sync concurrentes → un solo resultado (reclamo atómico).
- **RLS con dos organizaciones:** A no ve ni contamina B (listado de conexiones, eventos, citas importadas).
- OAuth: `state` inválido rechazado; `code` inválido rechazado; tokens cifrados en BD (no texto plano) — verificar con query puro.
- `npx tsc --noEmit`, ESLint, `npm run build` y checks existentes (`check:cfdi` incluido).
- Crea un check puro `web/scripts/check-calendario.ts` para validadores/LWW sin BD, al estilo `check-cfdi.ts`.

### 9. Documentación

- `docs/calendario.md`: arquitectura, ADR del proveedor, flujo OAuth, scopes, reglas de sync, conflictos, limitaciones, variables de entorno y guía de pruebas manuales reales (cómo Julio prueba con su cuenta personal en modo testing).
- Actualiza `.env.example` con `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `CALENDARIO_OAUTH_REDIRECT_BASE` y `CALENDARIO_PERMITIR_MOCK` (placeholders, sin secretos).
- Actualiza el `README` de pruebas cuando aplique (seguir el patrón de CFDI).

---

## Criterios de aceptación

- [ ] Conexión OAuth real de Google Calendar por organización (flujo completo, probado por Julio con su cuenta personal en Google Cloud modo testing).
- [ ] Crear/editar/cancelar cita en CRM se refleja en Calendar; y viceversa, con regla LWW cuando hay conflicto.
- [ ] Sin citas/eventos duplicados (unicidad por mapping evento↔cita).
- [ ] Un error de Google no rompe el flujo de citas del CRM.
- [ ] RLS probado con dos organizaciones.
- [ ] UI consistente, responsive, modo oscuro; estados de conexión y sync visibles.
- [ ] `tsc`, ESLint, build, check:cfdi, E2E con mock aprobados.
- [ ] Sin secretos en el repo, sin push, sin deploy.
- [ ] CFDI, pagos y su OAuth intactos.

---

## Formato de entrega

Al terminar, responde con:

1. Rama y commits locales.
2. Resumen de archivos cambiados.
3. Decisiones y supuestos (sobre todo: regla de conflicto y zona horaria).
4. Comandos ejecutados y resultados (`tsc`, `lint`, `build`, checks, E2E).
5. Evidencia de RLS e idempotencia.
6. Pendientes y lo que requiere cuenta/credenciales reales de Google.
7. Riesgos o cosas que Julio debe revisar.

No avances a la siguiente fase. No hagas push. No despliegues. Código listo para revisión de Julio.
