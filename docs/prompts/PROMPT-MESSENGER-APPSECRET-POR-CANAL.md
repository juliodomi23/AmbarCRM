# Prompt para Codex — Messenger: App Secret/App ID por canal

> Copia desde "## Prompt" y pégalo en Codex. Corrida única, una sola parada al final.

## Prompt

Trabajas en AmbarCRM (`docs/08-productos-internos/AmbarCRM`, código en `web/`). Continúa en la rama
`canales-messenger-api` (no crees otra). **No hagas push, deploy ni toques producción ni `ambarcrm-db`.**
Reglas del repo en `PLAN-CIERRE-FASE-2.md`: BD desechable en :55450 armada con `schema.sql` +
`multi-tenant.sql` + `actualizaciones.sql` (no `prisma db push`), `test-aislamiento.ts` y
`scripts/check-seguridad.ts` en verde, commit por paso, español, sin comentarios obvios ni librerías nuevas.

### Problema

`web/src/app/api/messenger/webhook/route.ts` valida `X-Hub-Signature-256` solo con el `META_APP_SECRET`
global (app de Tech Provider), y `normalizarMessenger` omite ecos comparando `app_id` con el
`META_APP_ID` global. Si una página de Messenger usa **otra app de Meta** (caso SEMBID mientras Meta
aprueba Tech Provider), todos los eventos llegan firmados con otro secreto → 401, y los ecos propios no
se reconocen. El webhook de WhatsApp (`/api/meta/webhook`) ya resuelve esto con un `appSecret` por canal:
reutiliza ese patrón y `verifyMetaWebhookSignature(raw, firma, appSecret)`, que ya acepta el secreto
como parámetro.

### Qué hacer

1. **Config del canal:** `guardarCanalMessenger` (`web/src/lib/services/canales.ts`) acepta `app_secret`
   y `app_id` opcionales; `app_secret` se guarda cifrado como el token (`encryptMetaToken`), `app_id`
   en claro. Si no vienen, se conserva lo que haya; sin ellos el canal usa los globales. Nunca devolver
   `app_secret` en respuestas ni listas. Añade los dos campos opcionales al formulario de Messenger en
   Configuración → Canales.
2. **Webhook POST:** el orden debe ser (a) leer el cuerpo crudo, (b) extraer `entry[].id` con un parseo
   mínimo **sin confiar en nada más**, (c) resolver la empresa con `resolve_org_by_page` y cargar el
   canal bajo RLS, (d) verificar la firma contra el `appSecret` del canal si lo tiene y, si no, contra
   el global, (e) solo entonces procesar. Firma inválida → 401 y **ninguna escritura**. Si el cuerpo
   trae varias páginas, cada entrada se verifica con el secreto de su propio canal; una firma válida
   para una página no autoriza otra. Página desconocida → 200 sin hacer nada (como hoy).
3. **Ecos propios:** `normalizarMessenger` recibe el `appId` del canal (o el global como respaldo) en vez
   de leer `process.env.META_APP_ID` directamente.
4. **Error claro:** si la página ya está activa en otra empresa (índice único
   `canales_messenger_page_activa_uq`) o en el mismo CRM, `guardarCanalMessenger` responde 409 con
   "esa página ya está conectada" en vez de un 500 de Prisma. Nota: la comprobación real debe hacerse
   con `resolve_org_by_page` (la RLS impide ver otras empresas) o capturando el error `P2002`/`23505`.
5. **Sin cambios de esquema SQL**: el secreto y el app id viven en `config` (JSON). Si descubres que
   hace falta SQL, anótalo en el informe.

### Pruebas (en `web/prisma/scripts/test-canales-messenger.ts`)

- Canal con `appSecret` propio: firma con ese secreto → procesa; firma con el global → 401 sin escrituras.
- Canal sin `appSecret`: sigue funcionando con el global (regresión).
- Cuerpo con dos páginas de dos empresas, firmado para una sola → solo se procesa la autorizada.
- Eco con `app_id` igual al `appId` del canal se omite; con otro `app_id` se guarda saliente.
- Página repetida → 409 legible.
- `app_secret` nunca aparece en la respuesta de listar/editar canales ni en bitácora.
- Todo con Graph simulado, sin llamadas reales a Meta.

### Al terminar (única parada)

Corre `tsc --noEmit`, build, las pruebas de canales, `test-aislamiento.ts` y `check-seguridad.ts`.
Un commit `feat(canales): …` por paso, sin push. Actualiza `docs/despliegue-bot.md` (cuándo usar
secreto por canal vs global) y `docs/canales-decisiones.md`. Entrega resumen corto: commits, archivos,
pruebas y resultado, y lo que no pudiste probar. **Detente y espera revisión.**
