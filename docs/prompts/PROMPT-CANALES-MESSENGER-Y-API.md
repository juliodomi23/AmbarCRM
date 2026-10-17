# Prompt para Codex — canales Messenger y API libre (compatibles con Chatwoot)

> Copia desde "## Prompt" y pégalo en Codex. Plan completo: `PLAN-CANALES-MESSENGER-Y-API.md`.
> Corrida única: Codex hace las Fases 0 a 4 seguidas, con commit por paso, y se detiene **una sola vez, al final**.

## Prompt

Trabajas en AmbarCRM (`docs/08-productos-internos/AmbarCRM`, código en `web/`). **No hagas push, deploy
ni toques ninguna BD de producción ni `ambarcrm-db`.** Parte de `modulos-fase-2`; crea la rama
`canales-messenger-api`. Reglas del repo en `PLAN-CIERRE-FASE-2.md`: BD de pruebas desechable en
:55450 armada con `schema.sql` + `multi-tenant.sql` + `actualizaciones.sql` (no `prisma db push`),
RLS + GRANT en toda tabla nueva, `test-aislamiento.ts` y `scripts/check-seguridad.ts` en verde,
commit por paso, español, sin comentarios obvios ni librerías nuevas si no hacen falta.

### Objetivo

Hoy solo existe el proveedor `cloud_api`. Quiero dos canales nuevos que se comporten como las
bandejas de Chatwoot, para que un bot de n8n hecho para Chatwoot (el de SEMBID) funcione cambiando
solo su nodo de configuración:

1. **Canal Messenger** (página de Facebook).
2. **Canal API libre** (cualquier sistema externo manda y recibe mensajes por HTTP).

La API del bot (`/api/v1/accounts/1/conversations/{id}/…`) ya existe y **no cambia**: solo debe
funcionar también para conversaciones de estos canales.

### Referencia: cómo lo hace Chatwoot (repo `chatwoot/chatwoot`, rama `develop`)

- `app/models/channel/api.rb`: el canal API tiene `identifier`, `hmac_token`, `hmac_mandatory`,
  `webhook_url`, `secret`. Es una bandeja con un identificador público.
- `config/routes.rb`, `public/api/v1`: crear contacto `POST /inboxes/:inbox_id/contacts`, crear
  conversación `POST …/contacts/:contact_id/conversations`, crear mensaje
  `POST …/conversations/:conversation_id/messages`.
- `lib/webhooks/trigger.rb`: el webhook saliente va por POST JSON con
  `X-Chatwoot-Delivery`, `X-Chatwoot-Timestamp` y `X-Chatwoot-Signature` =
  `sha256=` + HMAC-SHA256(secret, `"<timestamp>.<body exacto>"`). Timeout 5 s, sin reintentos propios;
  si falla, el mensaje queda `failed`.
- `app/models/channel/facebook_page.rb`: `page_id`, `page_access_token`, `user_access_token`. Al
  conectar, suscribe la página a `messages, message_deliveries, message_echoes, message_reads,
  standby, messaging_handovers, messaging_postbacks`.
- `app/services/facebook/send_on_facebook_service.rb`: envía con `messaging_type: 'RESPONSE'`; fuera
  de ventana usa `MESSAGE_TAG` + `HUMAN_AGENT`. Texto primero, cada adjunto como mensaje aparte
  (`image|audio|video|file`, por URL). Si el error dice "session has been invalidated" o "Error
  validating access token", marca el canal con error de autorización.
- No copies código ni dependencias de Chatwoot (es Ruby); solo el contrato.

### Cómo trabajar

Ejecuta las fases 0 a 4 **en orden y sin detenerte entre ellas**. Al cerrar cada fase corre sus
pruebas, `test-aislamiento.ts` y `check-seguridad.ts`; haz commit; y solo continúa si todo está en
verde. Si algo falla y no logras arreglarlo en un intento razonable, **detente ahí** y reporta qué
falló y en qué commit quedaste (no sigas construyendo encima de algo roto). Para lo ambiguo, elige
la opción más simple y compatible con Chatwoot y anótala en `docs/canales-decisiones.md`.

### Fase 0 — lectura (sin cambios de código)

Lee y resume en `docs/canales-fase-0.md` (máx. 1 página): `web/src/lib/channel/*`,
`web/src/lib/services/ingest.ts`, `web/src/app/api/wa/webhook/*`, `web/src/app/api/meta/webhook/route.ts`,
`web/src/lib/bot-auth.ts`, `web/src/lib/services/bots.ts` y la ruta `…/messages/route.ts`. Incluye:
dónde se asume `telefono`/`cloud_api`, cómo se resuelve la empresa (RLS) en un webhook sin sesión,
y la lista exacta de archivos que vas a tocar. Commit `docs(canales): fase 0` y continúa.

### Fase 1 — base

1. `proveedor_canal` += `'messenger'` y `'api'`, en `actualizaciones.sql` y `schema.sql`, idempotente
   (mira cómo se hizo el cambio previo del enum, hay un `RENAME`). Actualiza `schema.prisma`.
2. Identidad de contacto por canal: añade `identificador_externo` (texto, nullable) y un índice
   UNIQUE parcial `(canal_id, identificador_externo)`. `telefono` sigue siendo opcional. Define y
   documenta cómo se enlaza un contacto de Messenger/API que luego aparezca con teléfono.
3. `ChannelProvider.nombre` pasa a la unión de proveedores; `enviarTexto` recibe un `destinatario`
   (teléfono, PSID o id externo según el canal); `getProvider` despacha por proveedor sin romper
   `cloud_api`. Ningún call-site de WhatsApp debe cambiar de comportamiento.
4. `…/messages/route.ts`: resolver el destinatario según el canal en vez de exigir `telefono` y
   `cloud_api`. Mantén las notas privadas y la bitácora tal cual.
5. Idempotencia: `wa_message_id` genérico único por canal.

Pruebas: las existentes siguen verdes + una que demuestre que un contacto sin teléfono recibe
respuesta del bot por un proveedor falso (stub).

### Fase 2 — Canal API libre

- **Entrada:** `POST /api/canal-api/{canalId}/mensajes`, header `x-api-key` propio del canal (se
  genera al crear el canal, se guarda hasheado o cifrado como el resto de secretos del repo, se
  muestra una sola vez). Body:
  `{ contacto: { id_externo, nombre?, telefono? }, mensaje: { id, tipo, contenido?, media_url? }, timestamp? }`.
  Idempotente por `mensaje.id`. Entra por el mismo pipeline que WhatsApp (contacto → conversación →
  etiquetas/bot → automatizaciones → SSE); **no dupliques lógica**, extrae lo que haga falta de
  `ingest.ts`.
- **Salida:** cada mensaje saliente (bot o asesor) se manda por POST JSON a `webhook_url` del canal,
  con `X-Ambar-Delivery`, `X-Ambar-Timestamp` y `X-Ambar-Signature = sha256=` + HMAC-SHA256(secreto,
  `"<timestamp>.<body>"`) (mismo formato que Chatwoot). Timeout 5 s, hasta 3 reintentos con espera
  creciente, estado `enviado`/`fallido` en el mensaje. Valida `webhook_url` (https, sin IPs
  privadas/localhost) para evitar SSRF.
- **Configuración:** crear/editar canal API desde Configuración → Canales (nombre, `webhook_url`,
  mostrar secreto una vez, regenerar).
- Documenta en `docs/canal-api.md` con ejemplos `curl` (entrada y verificación de firma en Node).

Pruebas: idempotencia, firma válida/ inválida, reintento, `webhook_url` privada rechazada, aislamiento
entre empresas (la `x-api-key` de A no escribe en B).

### Fase 3 — Messenger

- **Webhook:** `GET/POST /api/messenger/webhook`. GET: verificación `hub.mode/hub.verify_token/
  hub.challenge` con `MESSENGER_VERIFY_TOKEN`. POST: valida `X-Hub-Signature-256` con
  `META_APP_SECRET` (comparación en tiempo constante) **antes** de parsear. Procesa `messages`,
  `message_echoes` (mensajes de la página desde otro cliente → saliente), `message_deliveries` y
  `message_reads` (estados). Ignora el resto con 200. Resuelve el canal por `page_id` sin sesión,
  igual que `/api/meta/webhook`, respetando RLS.
- **Envío:** `POST https://graph.facebook.com/<versión>/me/messages` con el `page_access_token` del
  canal. `messaging_type: "RESPONSE"` dentro de 24 h; fuera de ventana, `MESSAGE_TAG` +
  `HUMAN_AGENT` hasta 7 días **solo si es un asesor humano**; si no se puede, `fallido` con motivo
  legible. Texto primero y cada adjunto aparte (`image|audio|video|file` por URL pública).
  Errores de token vencido → canal `desconectado` y aviso en Configuración.
- **Conexión (sin App Review):** pegar `page_id` + `page_access_token` en Configuración → Canales
  (mira `ConexionManual.tsx`), cifrado igual que `cloud_api`. Al guardar, suscribe la página a los
  campos listados arriba (`POST /{page_id}/subscribed_apps`). Sin login de Facebook por ahora.
- **Contacto:** `identificador_externo` = PSID; nombre/foto con el Graph API de perfil si el permiso
  lo deja, con degradación elegante si no.
- **Ventana:** guarda `ultimo_entrante_at` por conversación y úsalo para el aviso en la UI y para
  elegir `RESPONSE` vs `HUMAN_AGENT`.
- Variables nuevas en `docs/despliegue-bot.md` o `DESPLIEGUE.md`: `META_APP_SECRET` (si ya existe una
  equivalente para WhatsApp, reutilízala), `MESSENGER_VERIFY_TOKEN`, versión del Graph API.

Pruebas: firma inválida → 401 y nada se guarda; PSID repetido no duplica contacto; eco de página
queda saliente; fuera de 24 h usa el tag o marca fallido; token vencido desconecta el canal. Todo
con el Graph API simulado, **sin llamadas reales a Meta**.

### Fase 4 — UI mínima

Selector de tipo al crear canal (WhatsApp / Messenger / API), ícono del canal en la bandeja y en el
chat, y banner "ventana de 24 h cerrada" en Messenger. Nada más. Reutiliza componentes existentes.

### Fuera de alcance

Instagram, Telegram, difusión por Messenger, login de Facebook/Embedded Signup de Messenger, app
móvil, cambios al contrato de `/api/v1`, cambios en producción o en `meta-tech-provider`.

### Al terminar cada fase

`tsc --noEmit`, build, tests de la fase, `test-aislamiento.ts` y `check-seguridad.ts` en verde. Un
commit por paso con mensaje `feat(canales): …` / `test(canales): …`. Sin push.

### Al terminar TODO (única parada)

Entrega un resumen corto con: commits por fase, archivos tocados, pruebas que corrieron y su
resultado, decisiones de `docs/canales-decisiones.md`, variables de entorno nuevas, cambios de
esquema SQL que habría que aplicar a mano en una BD existente, y cualquier cosa que no pudiste
probar. **Detente y espera revisión.**
